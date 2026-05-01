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
  queueMode: process.env.QUEUE_MODE === "sqlite" ? "sqlite" : "redis",
  runnerMode: process.env.RUNNER_MODE === "local" ? "local" : "docker",
  dockerImage: process.env.DOCKER_IMAGE ?? DEFAULT_DOCKER_IMAGE,
  buildMemory: process.env.BUILD_MEMORY ?? DEFAULT_BUILD_MEMORY,
  buildCpus: process.env.BUILD_CPUS ?? DEFAULT_BUILD_CPUS,
  localJavaHome: process.env.LOCAL_JAVA_HOME ?? process.env.JAVA_HOME,
  localAndroidHome: process.env.LOCAL_ANDROID_HOME ?? process.env.ANDROID_HOME,
  localBashPath: process.env.LOCAL_BASH_PATH,
  localPathExtra: process.env.LOCAL_PATH_EXTRA ?? "",
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? "1")
};

export function ensureStorageDirs(): void {
  for (const directory of [config.uploadsDir, config.artifactsDir, config.workspacesDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}
