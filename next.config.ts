import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" bundles a minimal server for Docker/self-hosting.
  output: "standalone",
};

export default nextConfig;
