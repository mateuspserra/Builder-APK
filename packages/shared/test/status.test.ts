import { describe, expect, it } from "vitest";
import { canTransitionBuildStatus, isFinalBuildStatus } from "../src/index.js";

describe("build status transitions", () => {
  it("allows expected running lifecycle transitions", () => {
    expect(canTransitionBuildStatus("queued", "running")).toBe(true);
    expect(canTransitionBuildStatus("running", "success")).toBe(true);
    expect(canTransitionBuildStatus("running", "failed")).toBe(true);
    expect(canTransitionBuildStatus("running", "timed_out")).toBe(true);
  });

  it("blocks transitions from final states", () => {
    expect(isFinalBuildStatus("success")).toBe(true);
    expect(canTransitionBuildStatus("success", "running")).toBe(false);
    expect(canTransitionBuildStatus("canceled", "failed")).toBe(false);
  });
});
