import { Queue } from "bullmq";
import { BUILD_QUEUE_NAME } from "@apk-builder/shared";

export function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: Number(url.port || "6379"),
      username: url.username || undefined,
      password: url.password || undefined
    };
  }

  return {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT ?? "6379")
  };
}

export const buildQueue = new Queue(BUILD_QUEUE_NAME, {
  connection: getRedisConnection()
});
