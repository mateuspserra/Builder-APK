import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { ensureStorageDirs, config } from "./services/env.js";
import { prisma } from "./services/prisma.js";
import { buildQueue } from "./services/queue.js";
import { buildRoutes } from "./routes/builds.js";
import { uploadRoutes } from "./routes/uploads.js";
import { uiRoutes } from "./routes/ui.js";

export async function buildServer() {
  ensureStorageDirs();

  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024
  });

  await app.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 1024,
      files: 1
    }
  });

  await app.register(uiRoutes);
  await app.register(uploadRoutes);
  await app.register(buildRoutes);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    return reply.code(500).send({
      error: "internal_server_error",
      message: error.message
    });
  });

  app.addHook("onClose", async () => {
    await buildQueue.close();
    await prisma.$disconnect();
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();
  await app.listen({ host: config.host, port: config.port });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  start().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
