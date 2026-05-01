import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../services/env.js";
import { createQueuedBuild } from "../services/buildRequests.js";
import { toBuildDto } from "../services/buildDto.js";

type RawBodyRequest = FastifyRequest & {
  rawBody?: Buffer;
};

const githubPushPayloadSchema = z
  .object({
    ref: z.string(),
    deleted: z.boolean().optional(),
    after: z.string().optional(),
    repository: z
      .object({
        clone_url: z.string().url().optional(),
        html_url: z.string().url().optional(),
        ssh_url: z.string().optional(),
        full_name: z.string().optional()
      })
      .passthrough(),
    pusher: z
      .object({
        name: z.string().optional(),
        email: z.string().optional()
      })
      .optional()
  })
  .passthrough();

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/github", async (request, reply) => {
    if (!config.githubWebhookSecret) {
      return reply.code(503).send({ error: "github_webhook_disabled" });
    }

    const event = request.headers["x-github-event"];
    const rawBody = (request as RawBodyRequest).rawBody;

    if (!rawBody) {
      return reply.code(400).send({ error: "missing_raw_body" });
    }

    if (!verifyGitHubSignature(rawBody, request.headers["x-hub-signature-256"])) {
      return reply.code(401).send({ error: "invalid_signature" });
    }

    if (event === "ping") {
      return { ok: true, event: "ping" };
    }

    if (event !== "push") {
      return reply.code(202).send({ ignored: true, reason: "unsupported_event", event });
    }

    const parsed = githubPushPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_github_payload", details: parsed.error.flatten() });
    }

    const payload = parsed.data;
    if (payload.deleted) {
      return reply.code(202).send({ ignored: true, reason: "deleted_ref" });
    }

    const branch = branchFromRef(payload.ref);
    if (!branch) {
      return reply.code(202).send({ ignored: true, reason: "not_a_branch", ref: payload.ref });
    }

    if (branch !== config.githubWebhookBranch) {
      return reply.code(202).send({
        ignored: true,
        reason: "branch_not_configured",
        branch,
        expectedBranch: config.githubWebhookBranch
      });
    }

    const repoUrl = payload.repository.clone_url ?? payload.repository.html_url;
    if (!repoUrl) {
      return reply.code(400).send({ error: "missing_repository_url" });
    }

    if (!isAllowedRepository(payload.repository, repoUrl)) {
      return reply.code(403).send({ error: "repository_not_allowed" });
    }

    const build = await createQueuedBuild({
      source: {
        type: "git",
        repoUrl,
        branch
      },
      projectType: config.githubWebhookProjectType,
      profile: config.githubWebhookProfile,
      buildSpec: config.githubWebhookBuildSpec,
      env: config.githubWebhookEnv,
      systemLog: [
        "Build queued by GitHub webhook",
        payload.repository.full_name ? `repo=${payload.repository.full_name}` : null,
        `branch=${branch}`,
        payload.after ? `commit=${payload.after}` : null,
        payload.pusher?.name ? `pusher=${payload.pusher.name}` : null
      ]
        .filter(Boolean)
        .join(" ")
    });

    return reply.code(202).send({
      accepted: true,
      build: toBuildDto(build)
    });
  });
}

function branchFromRef(ref: string): string | null {
  const prefix = "refs/heads/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined
): boolean {
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", config.githubWebhookSecret)
    .update(rawBody)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function isAllowedRepository(
  repository: z.infer<typeof githubPushPayloadSchema>["repository"],
  repoUrl: string
): boolean {
  if (config.githubWebhookAllowedRepos.length === 0) {
    return true;
  }

  const candidates = [repoUrl, repository.clone_url, repository.html_url, repository.ssh_url]
    .filter((value): value is string => Boolean(value))
    .map(normalizeRepositoryUrl);
  const allowed = config.githubWebhookAllowedRepos.map(normalizeRepositoryUrl);

  return candidates.some((candidate) => allowed.includes(candidate));
}

function normalizeRepositoryUrl(value: string): string {
  return value
    .trim()
    .replace(/\/$/, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}
