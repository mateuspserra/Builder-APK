import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import {
  canTransitionBuildStatus,
  isBuildStatus,
  isFinalBuildStatus,
  isPathInside,
  type BuildStatus
} from "@apk-builder/shared";
import {
  artifactParamsSchema,
  buildIdParamsSchema,
  createBuildRequestSchema,
  logsStreamQuerySchema,
  paginationQuerySchema
} from "../schemas/buildSchemas.js";
import { config } from "../services/env.js";
import { prisma } from "../services/prisma.js";
import { buildQueue } from "../services/queue.js";
import { stopBuildContainer } from "../services/docker.js";
import { toBuildDto } from "../services/buildDto.js";
import {
  appendSystemLog,
  assertBuildSourceExists,
  createQueuedBuild
} from "../services/buildRequests.js";

async function markBuildCanceled(buildId: string, status: BuildStatus): Promise<void> {
  if (!canTransitionBuildStatus(status, "canceled")) {
    return;
  }

  await prisma.build.update({
    where: { id: buildId },
    data: {
      status: "canceled",
      finishedAt: new Date(),
      errorMessage: "Build canceled by user"
    }
  });
}

export async function buildRoutes(app: FastifyInstance): Promise<void> {
  app.post("/builds", async (request, reply) => {
    const parsed = createBuildRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_build_request", details: parsed.error.flatten() });
    }

    try {
      assertBuildSourceExists(parsed.data.source);
    } catch (error) {
      if (error instanceof Error && error.message === "upload_not_found") {
        return reply.code(400).send({ error: "upload_not_found" });
      }

      throw error;
    }

    const build = await createQueuedBuild(parsed.data);

    return reply.code(201).send(toBuildDto(build));
  });

  app.get("/builds", async (request, reply) => {
    const parsed = paginationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_pagination", details: parsed.error.flatten() });
    }

    const { page, limit } = parsed.data;
    const [total, builds] = await Promise.all([
      prisma.build.count(),
      prisma.build.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { artifacts: true }
      })
    ]);

    return {
      items: builds.map(toBuildDto),
      pagination: {
        page,
        limit,
        total
      }
    };
  });

  app.get("/builds/:id", async (request, reply) => {
    const parsed = buildIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_build_id" });
    }

    const build = await prisma.build.findUnique({
      where: { id: parsed.data.id },
      include: { artifacts: true }
    });

    if (!build) {
      return reply.code(404).send({ error: "build_not_found" });
    }

    return toBuildDto(build);
  });

  app.get("/builds/:id/logs", async (request, reply) => {
    const parsed = buildIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_build_id" });
    }

    const build = await prisma.build.findUnique({ where: { id: parsed.data.id } });
    if (!build) {
      return reply.code(404).send({ error: "build_not_found" });
    }

    const logs = await prisma.buildLog.findMany({
      where: { buildId: parsed.data.id },
      orderBy: { id: "asc" }
    });

    return reply.type("text/plain").send(logs.map((log) => log.line).join("\n"));
  });

  app.get("/builds/:id/logs/stream", async (request, reply) => {
    const params = buildIdParamsSchema.safeParse(request.params);
    const query = logsStreamQuerySchema.safeParse(request.query);

    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "invalid_stream_request" });
    }

    const build = await prisma.build.findUnique({ where: { id: params.data.id } });
    if (!build) {
      return reply.code(404).send({ error: "build_not_found" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    reply.raw.write(": connected\n\n");

    let lastId = query.data.after;
    let closed = false;

    const sendPending = async (): Promise<void> => {
      if (closed) {
        return;
      }

      const logs = await prisma.buildLog.findMany({
        where: {
          buildId: params.data.id,
          id: { gt: lastId }
        },
        orderBy: { id: "asc" },
        take: 500
      });

      for (const log of logs) {
        lastId = log.id;
        reply.raw.write(`id: ${log.id}\n`);
        reply.raw.write("event: log\n");
        reply.raw.write(
          `data: ${JSON.stringify({
            id: log.id,
            timestamp: log.timestamp,
            stream: log.stream,
            line: log.line
          })}\n\n`
        );
      }

      const current = await prisma.build.findUnique({
        where: { id: params.data.id },
        select: { status: true }
      });

      if (current && isBuildStatus(current.status) && isFinalBuildStatus(current.status)) {
        reply.raw.write("event: end\n");
        reply.raw.write(`data: ${JSON.stringify({ status: current.status })}\n\n`);
        reply.raw.end();
        closed = true;
      }
    };

    const interval = setInterval(() => {
      sendPending().catch((error: unknown) => {
        app.log.error({ error }, "failed to stream build logs");
      });
    }, 1_000);

    request.raw.on("close", () => {
      closed = true;
      clearInterval(interval);
    });

    await sendPending();
  });

  app.get("/builds/:id/artifacts", async (request, reply) => {
    const parsed = buildIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_build_id" });
    }

    const build = await prisma.build.findUnique({
      where: { id: parsed.data.id },
      include: { artifacts: true }
    });

    if (!build) {
      return reply.code(404).send({ error: "build_not_found" });
    }

    return {
      items: toBuildDto(build).artifacts ?? []
    };
  });

  app.get("/builds/:id/artifacts/:artifactId/download", async (request, reply) => {
    const parsed = artifactParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_artifact_request" });
    }

    const artifact = await prisma.artifact.findFirst({
      where: {
        id: parsed.data.artifactId,
        buildId: parsed.data.id
      }
    });

    if (!artifact) {
      return reply.code(404).send({ error: "artifact_not_found" });
    }

    if (!isPathInside(config.artifactsDir, artifact.path) || !fs.existsSync(artifact.path)) {
      return reply.code(404).send({ error: "artifact_file_not_found" });
    }

    reply.header("Content-Type", artifact.mimeType);
    reply.header(
      "Content-Disposition",
      `attachment; filename="${artifact.filename.replace(/"/g, "")}"`
    );
    return reply.send(fs.createReadStream(artifact.path));
  });

  app.post("/builds/:id/cancel", async (request, reply) => {
    const parsed = buildIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_build_id" });
    }

    const build = await prisma.build.findUnique({ where: { id: parsed.data.id } });
    if (!build) {
      return reply.code(404).send({ error: "build_not_found" });
    }

    if (!isBuildStatus(build.status)) {
      return reply.code(409).send({ error: "invalid_build_status" });
    }

    if (isFinalBuildStatus(build.status)) {
      return reply.code(409).send({ error: "build_already_finished", status: build.status });
    }

    const job = config.queueMode === "redis" ? await buildQueue.getJob(build.id) : null;
    if (job && build.status === "queued") {
      try {
        await job.remove();
      } catch (error) {
        app.log.warn({ error, buildId: build.id }, "failed to remove queued job");
      }
    }

    if (build.status === "running") {
      await stopBuildContainer(build.id);
    }

    await markBuildCanceled(build.id, build.status);
    await appendSystemLog(build.id, "Build canceled by user");

    const updated = await prisma.build.findUnique({
      where: { id: build.id },
      include: { artifacts: true }
    });

    return toBuildDto(updated ?? build);
  });
}
