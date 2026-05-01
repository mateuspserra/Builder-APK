import { describe, expect, it } from "vitest";
import {
  generateDefaultBuildSpec,
  parseBuildSpecYaml,
  DEFAULT_BUILD_TIMEOUT_MINUTES
} from "../src/index.js";

describe("buildspec validation", () => {
  it("parses a valid buildspec and applies defaults", () => {
    const spec = parseBuildSpecYaml(`
name: android-debug
steps:
  - run: ./gradlew assembleDebug
artifacts:
  - app/build/outputs/apk/debug/*.apk
`);

    expect(spec.timeoutMinutes).toBe(DEFAULT_BUILD_TIMEOUT_MINUTES);
    expect(spec.network).toBe(true);
    expect(spec.steps[0]?.run).toBe("./gradlew assembleDebug");
  });

  it("rejects timeouts over the MVP maximum", () => {
    expect(() =>
      parseBuildSpecYaml(`
name: too-long
timeoutMinutes: 121
steps:
  - run: ./gradlew assembleDebug
artifacts:
  - "*.apk"
`)
    ).toThrow();
  });
});

describe("default buildspec generation", () => {
  it("generates android native debug defaults", () => {
    const spec = generateDefaultBuildSpec("android-native", "debug");

    expect(spec.steps).toEqual([{ run: "./gradlew clean assembleDebug" }]);
    expect(spec.artifacts).toContain("**/build/outputs/apk/debug/*.apk");
  });

  it("generates expo release defaults", () => {
    const spec = generateDefaultBuildSpec("expo", "release");

    expect(spec.steps.map((step) => step.run)).toEqual([
      "npm ci",
      "npx expo prebuild --platform android",
      "cd android && ./gradlew clean assembleRelease"
    ]);
    expect(spec.artifacts).toContain("android/app/build/outputs/bundle/release/*.aab");
  });
});
