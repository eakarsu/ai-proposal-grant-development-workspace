import type { NextConfig } from "next";
import path from "node:path";

const projectRoot =
  typeof __dirname !== "undefined" ? __dirname : process.cwd();

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "mammoth", "yauzl", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: {"/api/grants/**/*": ["./scripts/grant-document-worker.mjs", "./node_modules/pdfjs-dist/**/*", "./node_modules/mammoth/**/*", "./node_modules/yauzl/**/*", "./assets/grant-fonts/*"]},
  turbopack: {
    root: path.resolve(projectRoot),
  },
};

export default nextConfig;
