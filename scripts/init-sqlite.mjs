import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function resolveRepoRoot(start = process.cwd()) {
  let current = path.resolve(start);

  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    current = path.dirname(current);
  }

  return process.cwd();
}

function sqliteUrl(filePath) {
  return `file:${path.resolve(filePath).replace(/\\/g, "/")}`;
}

const repoRoot = resolveRepoRoot();
const dataDir = path.join(repoRoot, "data");
fs.mkdirSync(dataDir, { recursive: true });

process.env.DATABASE_URL ??= sqliteUrl(path.join(dataDir, "apk-builder.db"));

const migrationName = "20260429000000_init";
const migrationPath = path.join(repoRoot, "prisma", "migrations", migrationName, "migration.sql");
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const checksum = createHash("sha256").update(migrationSql).digest("hex");

const prisma = new PrismaClient();

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    tableName
  );

  return rows.length > 0;
}

async function main() {
  const hasBuildTable = await tableExists("Build");

  if (!hasBuildTable) {
    const statements = migrationSql
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(`${statement};`);
    }
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                    TEXT PRIMARY KEY NOT NULL,
      "checksum"              TEXT NOT NULL,
      "finished_at"           DATETIME,
      "migration_name"        TEXT NOT NULL,
      "logs"                  TEXT,
      "rolled_back_at"        DATETIME,
      "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `);

  const migrationRows = await prisma.$queryRawUnsafe(
    'SELECT id FROM "_prisma_migrations" WHERE migration_name=?',
    migrationName
  );

  if (migrationRows.length === 0) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "_prisma_migrations" (
          id,
          checksum,
          finished_at,
          migration_name,
          logs,
          rolled_back_at,
          started_at,
          applied_steps_count
        ) VALUES (?, ?, datetime('now'), ?, NULL, NULL, datetime('now'), 1);
      `,
      `${migrationName}-manual`,
      checksum,
      migrationName
    );
  }

  console.log(`SQLite database is ready at ${process.env.DATABASE_URL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
