import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "tesseract.js", "puppeteer"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
