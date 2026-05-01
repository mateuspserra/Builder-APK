import { buildStatuses, type BuildStatus } from "./types.js";

const transitions: Record<BuildStatus, BuildStatus[]> = {
  queued: ["running", "canceled", "failed"],
  running: ["success", "failed", "canceled", "timed_out"],
  success: [],
  failed: [],
  canceled: [],
  timed_out: []
};

export function isBuildStatus(value: string): value is BuildStatus {
  return buildStatuses.includes(value as BuildStatus);
}

export function isFinalBuildStatus(status: BuildStatus): boolean {
  return ["success", "failed", "canceled", "timed_out"].includes(status);
}

export function canTransitionBuildStatus(from: BuildStatus, to: BuildStatus): boolean {
  return from === to || transitions[from].includes(to);
}
