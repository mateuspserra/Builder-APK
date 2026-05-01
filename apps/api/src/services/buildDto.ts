import type { Artifact, Build } from "@prisma/client";

function parseEnvKeys(envJson: string): string[] {
  try {
    const parsed = JSON.parse(envJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    return Object.keys(parsed);
  } catch {
    return [];
  }
}

export function toBuildDto(build: Build & { artifacts?: Artifact[] }) {
  return {
    id: build.id,
    status: build.status,
    sourceType: build.sourceType,
    repoUrl: build.repoUrl,
    branch: build.branch,
    uploadId: build.uploadId,
    projectType: build.projectType,
    profile: build.profile,
    envKeys: parseEnvKeys(build.envJson),
    createdAt: build.createdAt,
    startedAt: build.startedAt,
    finishedAt: build.finishedAt,
    exitCode: build.exitCode,
    errorMessage: build.errorMessage,
    workspacePath: build.workspacePath,
    artifacts:
      build.artifacts?.map((artifact) => ({
        id: artifact.id,
        filename: artifact.filename,
        sizeBytes: artifact.sizeBytes,
        mimeType: artifact.mimeType,
        createdAt: artifact.createdAt
      })) ?? undefined
  };
}
