import { pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { ensureStorageDirs, config } from "./services/env.js";
import { prisma } from "./services/prisma.js";
import { buildQueue } from "./services/queue.js";
import { buildRoutes } from "./routes/builds.js";
import { uploadRoutes } from "./routes/uploads.js";
import { uiRoutes } from "./routes/ui.js";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicAuth(header: string | undefined): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");

  if (separator === -1) {
    return null;
  }

  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1)
  };
}

export async function buildServer() {
  ensureStorageDirs();

  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024
  });

  if (config.basicAuthUser && config.basicAuthPassword) {
    app.addHook("onRequest", async (request, reply) => {
      const credentials = parseBasicAuth(request.headers.authorization);
      const authorized =
        credentials &&
        safeEqual(credentials.user, config.basicAuthUser) &&
        safeEqual(credentials.password, config.basicAuthPassword);

      if (!authorized) {
        reply.header("WWW-Authenticate", 'Basic realm="APK Builder"');
        return reply.code(401).send({ error: "unauthorized" });
      }
    });
  }

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
