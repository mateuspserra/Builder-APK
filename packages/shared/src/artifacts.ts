import path from "node:path";
import { stat } from "node:fs/promises";
import fg from "fast-glob";
import type { ArtifactMatch } from "./types.js";

export async function findArtifacts(
  workspacePath: string,
  artifactGlobs: string[]
): Promise<ArtifactMatch[]> {
  const relativePaths = await fg(artifactGlobs, {
    cwd: workspacePath,
    onlyFiles: true,
    dot: false,
    unique: true,
    followSymbolicLinks: false,
    absolute: false
  });

  const matches: ArtifactMatch[] = [];
  for (const relativePath of relativePaths.sort()) {
    const absolutePath = path.join(workspacePath, relativePath);
    const fileStats = await stat(absolutePath);
    matches.push({
      relativePath: relativePath.replace(/\\/g, "/"),
      absolutePath,
      sizeBytes: fileStats.size
    });
  }

  return matches;
}

export function inferArtifactMimeType(filename: string): string {
  if (filename.endsWith(".apk")) {
    return "application/vnd.android.package-archive";
  }

  if (filename.endsWith(".aab")) {
    return "application/octet-stream";
  }

  return "application/octet-stream";
}
