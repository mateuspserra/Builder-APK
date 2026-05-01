export const buildStatuses = [
  "queued",
  "running",
  "success",
  "failed",
  "canceled",
  "timed_out"
] as const;

export type BuildStatus = (typeof buildStatuses)[number];

export const projectTypes = ["android-native", "expo"] as const;
export type ProjectType = (typeof projectTypes)[number];

export const buildProfiles = ["debug", "release", "custom"] as const;
export type BuildProfile = (typeof buildProfiles)[number];

export const logStreams = ["stdout", "stderr", "system"] as const;
export type LogStream = (typeof logStreams)[number];

export type GitSource = {
  type: "git";
  repoUrl: string;
  branch?: string;
};

export type ZipSource = {
  type: "zip";
  uploadId: string;
};

export type BuildSource = GitSource | ZipSource;

export type BuildStep = {
  name?: string;
  run: string;
};

export type BuildSpec = {
  name: string;
  timeoutMinutes: number;
  network: boolean;
  environment: Record<string, string>;
  steps: BuildStep[];
  artifacts: string[];
};

export type ArtifactMatch = {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
};
