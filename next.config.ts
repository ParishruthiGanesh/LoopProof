import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: { webpackBuildWorker: true },
};

export default nextConfig;
