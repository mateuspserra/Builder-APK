import { z } from "zod";
import { buildProfiles, projectTypes } from "@apk-builder/shared";

const envSchema = z.record(z.string(), z.string());

const gitSourceSchema = z
  .object({
    type: z.literal("git"),
    repoUrl: z.string().url(),
    branch: z.string().min(1).default("main")
  })
  .strict();

const zipSourceSchema = z
  .object({
    type: z.literal("zip"),
    uploadId: z.string().min(1)
  })
  .strict();

export const createBuildRequestSchema = z
  .object({
    source: z.discriminatedUnion("type", [gitSourceSchema, zipSourceSchema]),
    projectType: z.enum(projectTypes),
    profile: z.enum(buildProfiles).default("release"),
    buildSpec: z.string().min(1).optional(),
    env: envSchema.default({})
  })
  .strict();

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const buildIdParamsSchema = z
  .object({
    id: z.string().min(1)
  })
  .strict();

export const artifactParamsSchema = z
  .object({
    id: z.string().min(1),
    artifactId: z.string().min(1)
  })
  .strict();

export const logsStreamQuerySchema = z
  .object({
    after: z.coerce.number().int().min(0).default(0)
  })
  .strict();
