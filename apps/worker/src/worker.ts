import { pathToFileURL } from "node:url";
import { Job } from "bullmq";
import { ensureStorageDirs, config } from "./services/env.js";
import { prisma } from "./services/prisma.js";
import { createBuildWorker } from "./services/queue.js";
import { DockerBuildRunner } from "./runners/dockerRunner.js";

type BuildJobData = {
  buildId: string;
};

function getBuildId(job: Job): string {
  const data = job.data as Partial<BuildJobData>;
  if (!data.buildId) {
    throw new Error("BullMQ job is missing buildId");
  }

  return data.buildId;
}

export async function startWorker(): Promise<void> {
  ensureStorageDirs();
  const runner = new DockerBuildRunner();

  if (config.queueMode === "sqlite") {
    let active = false;
    const interval = setInterval(() => {
      if (active) {
        return;
      }

      active = true;
      void prisma.build
        .findFirst({
          where: { status: "queued" },
          orderBy: { createdAt: "asc" },
          select: { id: true }
        })
        .then(async (build) => {
          if (build) {
            await runner.run(build.id);
          }
        })
        .catch((error: unknown) => {
          console.error(error);
        })
        .finally(() => {
          active = false;
        });
    }, 2_000);

    console.log(`Worker started with SQLite polling queue and ${config.runnerMode} runner mode`);

    const shutdown = async (): Promise<void> => {
      console.log("Stopping worker");
      clearInterval(interval);
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      shutdown().catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
    });

    process.on("SIGTERM", () => {
      shutdown().catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
    });

    return;
  }

  const worker = createBuildWorker(async (job: Job) => {
    await runner.run(getBuildId(job));
  });

  worker.on("completed", (job) => {
    console.log(`Build job ${job.id ?? "unknown"} completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Build job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  console.log(
    `Worker started with concurrency ${config.workerConcurrency} and ${config.runnerMode} runner mode`
  );

  const shutdown = async (): Promise<void> => {
    console.log("Stopping worker");
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown().catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown().catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startWorker().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
