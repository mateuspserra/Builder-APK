import type { Prisma } from "@prisma/client";
import {
  canTransitionBuildStatus,
  isBuildStatus,
  type BuildStatus,
  type LogStream
} from "@apk-builder/shared";
import { prisma } from "./prisma.js";

export async function appendBuildLog(
  buildId: string,
  stream: LogStream,
  line: string
): Promise<void> {
  await prisma.buildLog.create({
    data: {
      buildId,
      stream,
      line
    }
  });
}

export async function transitionBuildStatus(
  buildId: string,
  nextStatus: BuildStatus,
  data: Omit<Prisma.BuildUpdateInput, "status"> = {}
): Promise<boolean> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { status: true }
  });

  if (!build || !isBuildStatus(build.status)) {
    return false;
  }

  if (!canTransitionBuildStatus(build.status, nextStatus)) {
    return false;
  }

  await prisma.build.update({
    where: { id: buildId },
    data: {
      ...data,
      status: nextStatus
    }
  });

  return true;
}
