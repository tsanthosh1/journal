import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
