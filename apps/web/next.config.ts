import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Standalone build for Docker/dokploy deployment.
  output: "standalone",
  // Trace from the monorepo root so workspace files are included.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    // Asset uploads go through a Server Action, whose request body is capped at
    // 1MB by default — a phone photo blows past that. `MAX_UPLOAD_BYTES` in
    // `lib/assets.ts` enforces the same ceiling where we can return a readable
    // error rather than a rejected request.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
