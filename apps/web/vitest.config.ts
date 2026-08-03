import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Some lib/studio modules import `@/lib/db` at module scope even though a
    // given unit test only exercises their pure functions. `@/lib/db` throws
    // at import time without DATABASE_URL, so the unit suite (which must run
    // with no Postgres) needs a placeholder value here. It is never connected
    // to — no unit test calls a Prisma method.
    env: { DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder" },
  },
});
