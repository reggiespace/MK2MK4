import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Standalone build for Docker/dokploy deployment.
  output: "standalone",
  // Trace from the monorepo root so workspace files are included.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
