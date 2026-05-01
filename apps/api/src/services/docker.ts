import { spawn } from "node:child_process";

export function buildContainerName(buildId: string): string {
  return `apk-build-${buildId}`;
}

export async function stopBuildContainer(buildId: string): Promise<void> {
  const containerName = buildContainerName(buildId);

  await new Promise<void>((resolve) => {
    const child = spawn("docker", ["stop", containerName], {
      stdio: "ignore",
      windowsHide: true
    });

    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}
