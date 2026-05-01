import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { resolveDataPath, resolveRepoRoot, toPrismaSqliteUrl } from "@apk-builder/shared";

export const repoRoot = resolveRepoRoot();

dotenv.config({ path: path.join(repoRoot, ".env") });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = toPrismaSqliteUrl(resolveDataPath("apk-builder.db"));
}

export const config = {
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.API_PORT ?? "3000"),
  queueMode: process.env.QUEUE_MODE === "sqlite" ? "sqlite" : "redis",
  uploadsDir: resolveDataPath("uploads"),
  artifactsDir: resolveDataPath("artifacts"),
  workspacesDir: resolveDataPath("workspaces")
};

export function ensureStorageDirs(): void {
  for (const directory of [config.uploadsDir, config.artifactsDir, config.workspacesDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}
