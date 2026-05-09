import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the workspace root so Turbopack/Next don't pick a wrong parent when
// multiple lockfiles or upstream `package.json` files exist. We've seen
// builds infer the wrong root and trace files outside the project.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["postgres", "puppeteer", "puppeteer-core", "@sparticuz/chromium-min"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
