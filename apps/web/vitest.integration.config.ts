// Loads apps/web/.env, which is where DATABASE_URL lives. Vitest does not read
// .env for process.env on its own, and lib/db.ts throws without DATABASE_URL —
// so this import is what makes the DB-backed suite runnable at all.
import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * DB-backed tests, kept apart from `pnpm test` so the unit suite stays runnable
 * with no Postgres. These write to the local dev database, creating a throwaway
 * workspace per test and cascade-deleting it afterwards — including on failure.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    // Each test owns its own workspace, but they share one Postgres connection
    // pool; running them serially keeps the failure output readable.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
