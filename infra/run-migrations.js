#!/usr/bin/env node
/**
 * Applies Prisma SQL migration files directly using pg, without needing
 * @prisma/engines native binaries. Each migration is tracked in a
 * _prisma_migrations table and skipped if already applied.
 */
const { Client } = require("/migrations-deps/node_modules/pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIGRATIONS_DIR = "/app/apps/web/prisma/migrations";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Create tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Get already-applied migrations
  const { rows: applied } = await client.query(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
  );
  const appliedSet = new Set(applied.map((r) => r.migration_name));

  // Read and sort migration directories
  const dirs = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((d) => d !== "migration_lock.toml" && fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory())
    .sort();

  for (const name of dirs) {
    const sqlFile = path.join(MIGRATIONS_DIR, name, "migration.sql");
    if (!fs.existsSync(sqlFile)) continue;

    if (appliedSet.has(name)) {
      console.log(`[migrations] skip: ${name} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(sqlFile, "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    console.log(`[migrations] applying: ${name}`);

    // Insert in-progress record
    await client.query(
      `INSERT INTO _prisma_migrations (migration_name, checksum, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), 0)
       ON CONFLICT (id) DO NOTHING`,
      [name, checksum]
    );

    await client.query(sql);

    // Mark done
    await client.query(
      `UPDATE _prisma_migrations SET finished_at = NOW(), applied_steps_count = 1
       WHERE migration_name = $1`,
      [name]
    );
    console.log(`[migrations] done: ${name}`);
  }

  await client.end();
  console.log("[migrations] all migrations applied");
}

main().catch((err) => {
  console.error("[migrations] FAILED:", err.message);
  process.exit(1);
});
