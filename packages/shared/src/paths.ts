import fs from "node:fs";
import path from "node:path";

export function resolveRepoRoot(start = process.cwd()): string {
  let current = path.resolve(start);

  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    current = path.dirname(current);
  }

  if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
    return current;
  }

  return path.resolve(start);
}

export function resolveDataPath(...segments: string[]): string {
  return path.join(resolveRepoRoot(), "data", ...segments);
}

export function toPrismaSqliteUrl(filePath: string): string {
  return `file:${path.resolve(filePath).replace(/\\/g, "/")}`;
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
