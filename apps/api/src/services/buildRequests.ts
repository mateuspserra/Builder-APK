import fs from "node:fs";
import path from "node:path";
import type { Build } from "@prisma/client";
import type { BuildProfile, BuildSource, ProjectType } from "@apk-builder/shared";
import { config } from "./env.js";
import { prisma } from "./prisma.js";
import { buildQueue } from "./queue.js";

type CreateQueuedBuildInput = {
  source: BuildSource;
  projectType: ProjectType;
  profile: BuildProfile;
  buildSpec?: string;
  env?: Record<string, string>;
  systemLog?: string;
};

export function assertBuildSourceExists(source: BuildSource): void {
  if (source.type !== "zip") {
    return;
  }

  const uploadPath = path.join(config.uploadsDir, `${source.uploadId}.zip`);
  if (!fs.existsSync(uploadPath)) {
    throw new Error("upload_not_found");
  }
}

export async function appendSystemLog(buildId: string, line: string): Promise<void> {
  await prisma.buildLog.create({
    data: {
      buildId,
      stream: "system",
      line
    }
  });
}

export async function createQueuedBuild(input: CreateQueuedBuildInput): Promise<Build> {
  const build = await prisma.build.create({
    data: {
      status: "queued",
      sourceType: input.source.type,
      repoUrl: input.source.type === "git" ? input.source.repoUrl : null,
      branch: input.source.type === "git" ? (input.source.branch ?? "main") : null,
      uploadId: input.source.type === "zip" ? input.source.uploadId : null,
      projectType: input.projectType,
      profile: input.profile,
      buildSpecYaml: input.buildSpec ?? null,
      envJson: JSON.stringify(input.env ?? {})
    }
  });

  await appendSystemLog(
    build.id,
    input.systemLog ?? `Build queued using ${config.queueMode} queue mode`
  );

  if (config.queueMode === "redis") {
    await buildQueue.add(
      "build",
      { buildId: build.id },
      {
        jobId: build.id,
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 86_400, count: 1_000 }
      }
    );
  }

  return build;
}
