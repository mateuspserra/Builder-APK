import YAML from "yaml";
import { z } from "zod";
import { DEFAULT_BUILD_TIMEOUT_MINUTES, MAX_BUILD_TIMEOUT_MINUTES } from "./constants.js";
import type { BuildProfile, BuildSpec, ProjectType } from "./types.js";

export const buildStepSchema = z
  .object({
    name: z.string().min(1).optional(),
    run: z.string().min(1)
  })
  .strict();

export const buildSpecSchema = z
  .object({
    name: z.string().min(1),
    timeoutMinutes: z
      .number()
      .int()
      .positive()
      .max(MAX_BUILD_TIMEOUT_MINUTES)
      .default(DEFAULT_BUILD_TIMEOUT_MINUTES),
    network: z.boolean().default(true),
    environment: z.record(z.string()).default({}),
    steps: z.array(buildStepSchema).min(1),
    artifacts: z.array(z.string().min(1)).min(1)
  })
  .strict();

export function parseBuildSpecYaml(yamlText: string): BuildSpec {
  const parsed = YAML.parse(yamlText) as unknown;
  return buildSpecSchema.parse(parsed);
}

export function serializeBuildSpec(buildSpec: BuildSpec): string {
  return YAML.stringify(buildSpec);
}

export function generateDefaultBuildSpec(
  projectType: ProjectType,
  profile: BuildProfile
): BuildSpec {
  const effectiveProfile = profile === "custom" ? "debug" : profile;
  const name = `${projectType}-${profile}`;

  if (projectType === "android-native" && effectiveProfile === "release") {
    return {
      name,
      timeoutMinutes: DEFAULT_BUILD_TIMEOUT_MINUTES,
      network: true,
      environment: {},
      steps: [{ run: "./gradlew clean assembleRelease bundleRelease" }],
      artifacts: [
        "app/build/outputs/bundle/release/*.aab",
        "**/build/outputs/bundle/release/*.aab",
        "app/build/outputs/apk/release/*.apk",
        "**/build/outputs/apk/release/*.apk"
      ]
    };
  }

  if (projectType === "android-native") {
    return {
      name,
      timeoutMinutes: DEFAULT_BUILD_TIMEOUT_MINUTES,
      network: true,
      environment: {},
      steps: [{ run: "./gradlew clean assembleDebug" }],
      artifacts: ["app/build/outputs/apk/debug/*.apk", "**/build/outputs/apk/debug/*.apk"]
    };
  }

  if (effectiveProfile === "release") {
    return {
      name,
      timeoutMinutes: DEFAULT_BUILD_TIMEOUT_MINUTES,
      network: true,
      environment: {},
      steps: [
        { run: "npm ci" },
        { run: "npx expo prebuild --platform android" },
        { run: "cd android && ./gradlew clean assembleRelease bundleRelease" }
      ],
      artifacts: [
        "android/app/build/outputs/bundle/release/*.aab",
        "android/**/build/outputs/bundle/release/*.aab",
        "android/app/build/outputs/apk/release/*.apk",
        "android/**/build/outputs/apk/release/*.apk"
      ]
    };
  }

  return {
    name,
    timeoutMinutes: DEFAULT_BUILD_TIMEOUT_MINUTES,
    network: true,
    environment: {},
    steps: [
      { run: "npm ci" },
      { run: "npx expo prebuild --platform android" },
      { run: "cd android && ./gradlew clean assembleDebug" }
    ],
    artifacts: ["android/app/build/outputs/apk/debug/*.apk"]
  };
}
