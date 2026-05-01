import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import AdmZip from "adm-zip";
import type { Build } from "@prisma/client";
import {
  findArtifacts,
  generateDefaultBuildSpec,
  inferArtifactMimeType,
  isBuildStatus,
  isPathInside,
  parseBuildSpecYaml,
  projectTypes,
  redactText,
  serializeBuildSpec,
  type BuildProfile,
  type BuildSpec,
  type LogStream,
  type ProjectType
} from "@apk-builder/shared";
import { config } from "../services/env.js";
import { prisma } from "../services/prisma.js";
import { appendBuildLog, transitionBuildStatus } from "../services/buildState.js";
import { LineBuffer } from "./lineBuffer.js";

type CommandResult = {
  exitCode: number;
  timedOut: boolean;
};

const validEnvNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function buildContainerName(buildId: string): string {
  return `apk-build-${buildId}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function parseEnvJson(envJson: string): Record<string, string> {
  try {
    const parsed = JSON.parse(envJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

function asProjectType(value: string): ProjectType {
  if (projectTypes.includes(value as ProjectType)) {
    return value as ProjectType;
  }

  throw new Error(`Unsupported project type: ${value}`);
}

function asBuildProfile(value: string): BuildProfile {
  if (value === "debug" || value === "release" || value === "custom") {
    return value;
  }

  throw new Error(`Unsupported build profile: ${value}`);
}

function maskUrlCredentials(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "***";
      url.password = "***";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function createBuildScript(buildSpec: BuildSpec): string {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "echo '[apk-builder] Container started'",
    "if [ -f ./gradlew ]; then chmod +x ./gradlew; fi",
    "if [ -f android/gradlew ]; then chmod +x android/gradlew; fi"
  ];

  buildSpec.steps.forEach((step, index) => {
    const label = step.name ?? step.run;
    lines.push(
      `echo ${shellQuote(`[apk-builder] Step ${index + 1}/${buildSpec.steps.length}: ${label}`)}`
    );
    lines.push(step.run);
  });

  lines.push("echo '[apk-builder] Build steps finished'");
  return `${lines.join("\n")}\n`;
}

async function resetDirectory(directory: string, expectedParent: string): Promise<void> {
  if (!isPathInside(expectedParent, directory)) {
    throw new Error(`Refusing to reset path outside storage: ${directory}`);
  }

  await fs.promises.rm(directory, { recursive: true, force: true });
  await fs.promises.mkdir(directory, { recursive: true });
}

async function appendRedactedLog(
  buildId: string,
  stream: LogStream,
  line: string,
  env: Record<string, string>
): Promise<void> {
  await appendBuildLog(buildId, stream, redactText(line, env));
}

async function runHostCommand(
  buildId: string,
  command: string,
  args: string[],
  cwd: string,
  redactionEnv: Record<string, string>
): Promise<number> {
  let logChain = Promise.resolve();
  const enqueueLog = (stream: LogStream, line: string): void => {
    logChain = logChain.then(() => appendRedactedLog(buildId, stream, line, redactionEnv));
  };

  const child = spawn(command, args, {
    cwd,
    env: process.env,
    windowsHide: true
  });

  const stdout = new LineBuffer((line) => enqueueLog("stdout", line));
  const stderr = new LineBuffer((line) => enqueueLog("stderr", line));

  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      stdout.flush();
      stderr.flush();
      resolve(code ?? 1);
    });
  });

  await logChain;
  return exitCode;
}

async function stopContainer(buildId: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn("docker", ["stop", buildContainerName(buildId)], {
      stdio: "ignore",
      windowsHide: true
    });

    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

async function cloneRepository(
  build: Build,
  workspacePath: string,
  env: Record<string, string>
): Promise<void> {
  if (!build.repoUrl) {
    throw new Error("Missing Git repository URL");
  }

  await appendBuildLog(
    build.id,
    "system",
    `Cloning ${maskUrlCredentials(build.repoUrl)} (${build.branch ?? "main"})`
  );

  const exitCode = await runHostCommand(
    build.id,
    "git",
    ["clone", "--depth", "1", "--branch", build.branch ?? "main", build.repoUrl, "."],
    workspacePath,
    env
  );

  if (exitCode !== 0) {
    throw new Error(`git clone failed with exit code ${exitCode}`);
  }
}

async function extractZip(build: Build, workspacePath: string): Promise<void> {
  if (!build.uploadId) {
    throw new Error("Missing upload id");
  }

  const zipPath = path.join(config.uploadsDir, `${build.uploadId}.zip`);
  if (!isPathInside(config.uploadsDir, zipPath) || !fs.existsSync(zipPath)) {
    throw new Error(`Upload ${build.uploadId} was not found`);
  }

  await appendBuildLog(build.id, "system", `Extracting upload ${build.uploadId}`);

  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    const destination = path.join(workspacePath, entry.entryName);
    if (!isPathInside(workspacePath, destination)) {
      throw new Error(`Refusing unsafe zip entry: ${entry.entryName}`);
    }

    if (entry.isDirectory) {
      await fs.promises.mkdir(destination, { recursive: true });
      continue;
    }

    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.writeFile(destination, entry.getData());
  }
}

async function resolveBuildSpec(build: Build, workspacePath: string): Promise<BuildSpec> {
  if (build.buildSpecYaml) {
    await appendBuildLog(build.id, "system", "Using inline buildspec");
    return parseBuildSpecYaml(build.buildSpecYaml);
  }

  for (const filename of ["buildspec.yml", "buildspec.yaml"]) {
    const candidate = path.join(workspacePath, filename);
    if (fs.existsSync(candidate)) {
      await appendBuildLog(build.id, "system", `Using ${filename}`);
      const yaml = await fs.promises.readFile(candidate, "utf8");
      const buildSpec = parseBuildSpecYaml(yaml);
      await prisma.build.update({
        where: { id: build.id },
        data: { buildSpecYaml: serializeBuildSpec(buildSpec) }
      });
      return buildSpec;
    }
  }

  const buildSpec = generateDefaultBuildSpec(
    asProjectType(build.projectType),
    asBuildProfile(build.profile)
  );
  await appendBuildLog(build.id, "system", "Using generated default buildspec");
  await prisma.build.update({
    where: { id: build.id },
    data: { buildSpecYaml: serializeBuildSpec(buildSpec) }
  });
  return buildSpec;
}

async function runDockerBuild(
  buildId: string,
  workspacePath: string,
  buildSpec: BuildSpec,
  env: Record<string, string>
): Promise<CommandResult> {
  const scriptDir = path.join(workspacePath, ".apk-builder");
  const scriptPath = path.join(scriptDir, "run.sh");
  await fs.promises.mkdir(scriptDir, { recursive: true });
  await fs.promises.writeFile(scriptPath, createBuildScript(buildSpec), "utf8");

  const dockerEnv = {
    ...buildSpec.environment,
    ...env,
    CI: "true"
  };

  const validEnv = Object.fromEntries(
    Object.entries(dockerEnv).filter(([name]) => validEnvNamePattern.test(name))
  );
  const invalidEnvNames = Object.keys(dockerEnv).filter((name) => !validEnvNamePattern.test(name));
  for (const name of invalidEnvNames) {
    await appendBuildLog(buildId, "system", `Skipping invalid environment variable name: ${name}`);
  }

  const containerName = buildContainerName(buildId);
  const args = [
    "run",
    "--rm",
    "--name",
    containerName,
    "--memory",
    config.buildMemory,
    "--cpus",
    config.buildCpus,
    "-v",
    `${workspacePath}:/workspace`,
    "-w",
    "/workspace"
  ];

  if (!buildSpec.network) {
    args.push("--network", "none");
  }

  for (const name of Object.keys(validEnv).sort()) {
    args.push("-e", name);
  }

  args.push(config.dockerImage, "bash", "/workspace/.apk-builder/run.sh");

  await appendBuildLog(
    buildId,
    "system",
    `Starting Docker container ${containerName} with image ${config.dockerImage}`
  );

  let logChain = Promise.resolve();
  const enqueueLog = (stream: LogStream, line: string): void => {
    logChain = logChain.then(() => appendRedactedLog(buildId, stream, line, validEnv));
  };

  const child = spawn("docker", args, {
    env: {
      ...process.env,
      ...validEnv
    },
    windowsHide: true
  });

  const stdout = new LineBuffer((line) => enqueueLog("stdout", line));
  const stderr = new LineBuffer((line) => enqueueLog("stderr", line));

  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

  let timedOut = false;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      appendBuildLog(
        buildId,
        "system",
        `Build exceeded timeout of ${buildSpec.timeoutMinutes} minutes`
      ).catch(() => undefined);
      stopContainer(buildId).catch(() => undefined);
    },
    buildSpec.timeoutMinutes * 60 * 1000
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      stdout.flush();
      stderr.flush();
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });

  await logChain;
  return { exitCode, timedOut };
}

async function collectArtifacts(
  buildId: string,
  workspacePath: string,
  buildSpec: BuildSpec
): Promise<number> {
  const matches = await findArtifacts(workspacePath, buildSpec.artifacts);
  const destinationDir = path.join(config.artifactsDir, buildId);
  await resetDirectory(destinationDir, config.artifactsDir);

  let count = 0;
  const usedFilenames = new Set<string>();

  for (const match of matches) {
    const parsed = path.parse(match.relativePath);
    let filename = parsed.base;
    let suffix = 1;

    while (usedFilenames.has(filename)) {
      filename = `${parsed.name}-${suffix}${parsed.ext}`;
      suffix += 1;
    }

    usedFilenames.add(filename);
    const destination = path.join(destinationDir, filename);
    await fs.promises.copyFile(match.absolutePath, destination);
    const stats = await fs.promises.stat(destination);

    await prisma.artifact.create({
      data: {
        buildId,
        filename,
        path: destination,
        sizeBytes: stats.size,
        mimeType: inferArtifactMimeType(filename)
      }
    });
    count += 1;
    await appendBuildLog(buildId, "system", `Saved artifact ${filename}`);
  }

  return count;
}

export class DockerBuildRunner {
  async run(buildId: string): Promise<void> {
    const build = await prisma.build.findUnique({ where: { id: buildId } });
    if (!build) {
      throw new Error(`Build ${buildId} was not found`);
    }

    const env = parseEnvJson(build.envJson);
    const workspacePath = path.join(config.workspacesDir, build.id);

    try {
      const started = await transitionBuildStatus(build.id, "running", {
        startedAt: new Date(),
        workspacePath
      });

      if (!started) {
        await appendBuildLog(
          build.id,
          "system",
          "Build was not started because it is no longer queued"
        );
        return;
      }

      await appendBuildLog(build.id, "system", "Preparing isolated workspace");
      await resetDirectory(workspacePath, config.workspacesDir);

      if (build.sourceType === "git") {
        await cloneRepository(build, workspacePath, env);
      } else if (build.sourceType === "zip") {
        await extractZip(build, workspacePath);
      } else {
        throw new Error(`Unsupported source type: ${build.sourceType}`);
      }

      const buildSpec = await resolveBuildSpec(build, workspacePath);
      const result = await runDockerBuild(build.id, workspacePath, buildSpec, env);

      const current = await prisma.build.findUnique({
        where: { id: build.id },
        select: { status: true }
      });

      if (current && isBuildStatus(current.status) && current.status === "canceled") {
        await appendBuildLog(build.id, "system", "Build was canceled");
        return;
      }

      if (result.timedOut) {
        await transitionBuildStatus(build.id, "timed_out", {
          finishedAt: new Date(),
          exitCode: result.exitCode,
          errorMessage: "Build timed out"
        });
        return;
      }

      if (result.exitCode !== 0) {
        await transitionBuildStatus(build.id, "failed", {
          finishedAt: new Date(),
          exitCode: result.exitCode,
          errorMessage: `Build failed with exit code ${result.exitCode}`
        });
        return;
      }

      const artifactCount = await collectArtifacts(build.id, workspacePath, buildSpec);
      if (artifactCount === 0) {
        await transitionBuildStatus(build.id, "failed", {
          finishedAt: new Date(),
          exitCode: result.exitCode,
          errorMessage: "No artifacts matched buildspec globs"
        });
        await appendBuildLog(build.id, "system", "No artifacts matched buildspec globs");
        return;
      }

      await transitionBuildStatus(build.id, "success", {
        finishedAt: new Date(),
        exitCode: result.exitCode
      });
      await appendBuildLog(build.id, "system", "Build finished successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown build error";
      await appendBuildLog(build.id, "system", `Build failed: ${message}`);
      await transitionBuildStatus(build.id, "failed", {
        finishedAt: new Date(),
        errorMessage: message
      });
      throw error;
    }
  }
}
