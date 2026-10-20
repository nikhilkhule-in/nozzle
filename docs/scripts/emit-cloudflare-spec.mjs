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
import { copyFile, mkdir, rm } from "node:fs/promises";
import {
  cleanBuildOutputDir,
  getWorkerAssetsDir,
  getWorkerBundleDir,
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
// The Magma product page is the site root: single source is the repo-root
// file, copied here so the worker can serve it as `/` (see worker/landing.js).
await copyFile(
  resolve(root, "..", "nozzle-product-page.html"),
  resolve(assetsDir, "landing.html"),
);

// The landing router ships verbatim: plain JS, no imports, no bundler.
const bundleDir = getWorkerBundleDir(root);
await mkdir(bundleDir, { recursive: true });
await copyFile(resolve(root, "worker/landing.js"), resolve(bundleDir, "worker.js"));
await writeWorkerConfig({
  root,
  config: {
    name: "nozzle-docs",
    compatibilityDate: "2026-09-30",
    domains: ["nozzle.nikhilkhule.com"],
    assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/"] },
    env: { ASSETS: { type: "assets" } },
    observability: { enabled: true },
  },
  // Workers mode: the landing router bundle lives alongside the assets.
  manifest: {
    type: "complete",
    mainModule: "worker.js",
    modules: { "worker.js": { type: "esm" } },
  },
});
await writeRootConfig(root, undefined, { isPreview: false, mode: undefined });

console.log("wrote Cloudflare build output for worker nozzle-docs (landing router + static docs assets)");
