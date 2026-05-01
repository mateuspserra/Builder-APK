import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findArtifacts } from "../src/index.js";

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "apk-builder-artifacts-"));
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("artifact glob detection", () => {
  it("finds APK and AAB outputs by glob", async () => {
    await fs.mkdir(path.join(workspace, "app/build/outputs/apk/debug"), { recursive: true });
    await fs.mkdir(path.join(workspace, "app/build/outputs/bundle/release"), { recursive: true });
    await fs.writeFile(path.join(workspace, "app/build/outputs/apk/debug/app-debug.apk"), "apk");
    await fs.writeFile(
      path.join(workspace, "app/build/outputs/bundle/release/app-release.aab"),
      "aab"
    );

    const artifacts = await findArtifacts(workspace, [
      "**/build/outputs/apk/**/*.apk",
      "**/build/outputs/bundle/**/*.aab"
    ]);

    expect(artifacts.map((artifact) => artifact.relativePath)).toEqual([
      "app/build/outputs/apk/debug/app-debug.apk",
      "app/build/outputs/bundle/release/app-release.aab"
    ]);
  });
});
