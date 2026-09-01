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
  // sharp ≥0.35 splits libvips into @img/sharp-libvips-* packages that
  // vercel/nft fails to trace (lovell/sharp#4567, #4543) — the deployed
  // function then dies with ERR_DLOPEN_FAILED: libvips-cpp.so.* missing,
  // which took the whole tRPC API down on 2026-09-01. Force every installed
  // @img package (pnpm keeps them under node_modules/.pnpm) into the API
  // function bundles. On Vercel's linux-x64 build only the linux variants
  // are installed, so this adds ~15MB, not every platform.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/.pnpm/@img+*/**/*",
      "./node_modules/@img/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
