import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" bundles a minimal server for Docker/self-hosting.
  // Vercel ignores this and uses its own build — so it's safe for both targets.
  output: "standalone",
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
