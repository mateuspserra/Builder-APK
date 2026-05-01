import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  DEFAULT_BUILD_CPUS,
  DEFAULT_BUILD_MEMORY,
  DEFAULT_DOCKER_IMAGE,
  resolveDataPath,
  resolveRepoRoot,
  toPrismaSqliteUrl
} from "@apk-builder/shared";

export const repoRoot = resolveRepoRoot();

dotenv.config({ path: path.join(repoRoot, ".env") });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = toPrismaSqliteUrl(resolveDataPath("apk-builder.db"));
}

export const config = {
  uploadsDir: resolveDataPath("uploads"),
  artifactsDir: resolveDataPath("artifacts"),
  workspacesDir: resolveDataPath("workspaces"),
  dockerImage: process.env.DOCKER_IMAGE ?? DEFAULT_DOCKER_IMAGE,
  buildMemory: process.env.BUILD_MEMORY ?? DEFAULT_BUILD_MEMORY,
  buildCpus: process.env.BUILD_CPUS ?? DEFAULT_BUILD_CPUS,
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? "1")
};

export function ensureStorageDirs(): void {
  for (const directory of [config.uploadsDir, config.artifactsDir, config.workspacesDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}
