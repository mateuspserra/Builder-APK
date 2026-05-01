import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  buildProfiles,
  projectTypes,
  resolveDataPath,
  resolveRepoRoot,
  toPrismaSqliteUrl,
  type BuildProfile,
  type ProjectType
} from "@apk-builder/shared";

export const repoRoot = resolveRepoRoot();

dotenv.config({ path: path.join(repoRoot, ".env") });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = toPrismaSqliteUrl(resolveDataPath("apk-builder.db"));
}

export const config = {
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.API_PORT ?? "3000"),
  basicAuthUser: process.env.BASIC_AUTH_USER ?? "",
  basicAuthPassword: process.env.BASIC_AUTH_PASSWORD ?? "",
  queueMode: process.env.QUEUE_MODE === "sqlite" ? "sqlite" : "redis",
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
  githubWebhookBranch: process.env.GITHUB_WEBHOOK_BRANCH ?? "main",
  githubWebhookProjectType: parseProjectType(process.env.GITHUB_WEBHOOK_PROJECT_TYPE),
  githubWebhookProfile: parseBuildProfile(process.env.GITHUB_WEBHOOK_PROFILE),
  githubWebhookAllowedRepos: parseCsv(process.env.GITHUB_WEBHOOK_ALLOWED_REPOS),
  githubWebhookBuildSpec: process.env.GITHUB_WEBHOOK_BUILD_SPEC || undefined,
  githubWebhookEnv: parseWebhookEnv(process.env.GITHUB_WEBHOOK_ENV_JSON),
  uploadsDir: resolveDataPath("uploads"),
  artifactsDir: resolveDataPath("artifacts"),
  workspacesDir: resolveDataPath("workspaces")
};

export function ensureStorageDirs(): void {
  for (const directory of [config.uploadsDir, config.artifactsDir, config.workspacesDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function parseProjectType(value: string | undefined): ProjectType {
  return projectTypes.includes(value as ProjectType) ? (value as ProjectType) : "android-native";
}

function parseBuildProfile(value: string | undefined): BuildProfile {
  return buildProfiles.includes(value as BuildProfile) ? (value as BuildProfile) : "debug";
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseWebhookEnv(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("GITHUB_WEBHOOK_ENV_JSON must be a JSON object");
  }

  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item)]));
}
