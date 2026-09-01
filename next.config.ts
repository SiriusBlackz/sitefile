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
  // ⚠️ sharp is PINNED to 0.34.5: sharp ≥0.35 splits libvips into
  // @img/sharp-libvips-* packages that vercel/nft fails to trace
  // (lovell/sharp#4567, #4543) — the deployed function dies with
  // ERR_DLOPEN_FAILED: libvips-cpp.so.* missing, which took the whole
  // tRPC API down for 3 days (2026-08-29 → 09-01). An
  // outputFileTracingIncludes glob over node_modules/.pnpm/@img+* is NOT
  // a fix: Vercel's packager rejects the symlinked pnpm layout ("invalid
  // deployment package"). Do not bump sharp to 0.35+ until the upstream
  // issue is fixed AND /api/health's sharp canary passes on a Vercel
  // deployment.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
