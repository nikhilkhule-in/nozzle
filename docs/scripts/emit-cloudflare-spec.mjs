// Emit the Cloudflare Build Output Specification for the prerendered docs
// site, so `cf deploy` can publish it as an assets-only Worker.
//
// Reads `.output/public` (produced by `vite build`) and writes
// `.cloudflare/output/v0/` (root config + default-worker config + assets).
// Worker identity (name, domains, observability) is declared in
// `cloudflare.config.ts`; the name/compatibility date are repeated here so
// the emitted spec is self-describing — keep them in sync.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile, rm } from "node:fs/promises";
import {
  cleanBuildOutputDir,
  getWorkerAssetsDir,
  writeAssets,
  writeRootConfig,
  writeWorkerConfig,
} from "@cloudflare/build-output-utils";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await cleanBuildOutputDir(root);
await writeAssets({ root, sourceDirectory: resolve(root, ".output/public") });

const assetsDir = getWorkerAssetsDir(root);
// The build's `_redirects` SPA rewrite loops when served from Workers
// Static Assets, so serve the shell Cloudflare's way instead: a root
// index.html plus single-page-application fallback. Prerendered pages and
// hashed assets keep winning as exact matches.
await rm(resolve(assetsDir, "_redirects"));
await copyFile(resolve(assetsDir, "_shell.html"), resolve(assetsDir, "index.html"));
await writeWorkerConfig({
  root,
  config: {
    name: "nozzle-docs",
    compatibilityDate: "2026-09-30",
    domains: ["nozzle.nikhilkhule.com"],
    assets: { notFoundHandling: "single-page-application" },
    observability: { enabled: true },
  },
});
await writeRootConfig(root, undefined, { isPreview: false, mode: undefined });

console.log("wrote Cloudflare build output for assets-only worker nozzle-docs");
