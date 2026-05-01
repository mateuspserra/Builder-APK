import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../services/env.js";

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/uploads", async (request, reply) => {
    const upload = await request.file();

    if (!upload) {
      return reply.code(400).send({ error: "missing_zip_file" });
    }

    const isZip =
      upload.mimetype === "application/zip" ||
      upload.mimetype === "application/x-zip-compressed" ||
      upload.filename.toLowerCase().endsWith(".zip");

    if (!isZip) {
      return reply.code(400).send({ error: "only_zip_uploads_are_supported" });
    }

    const uploadId = randomUUID();
    const destination = path.join(config.uploadsDir, `${uploadId}.zip`);

    await pipeline(upload.file, fs.createWriteStream(destination));
    const stats = await fs.promises.stat(destination);

    return reply.code(201).send({
      uploadId,
      filename: upload.filename,
      sizeBytes: stats.size
    });
  });
}
