import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "nozzle-docs",
    compatibilityDate: "2026-09-30",
    domains: ["nozzle.nikhilkhule.com"],
    // Only the site root hits the worker (serves the product page);
    // every other asset match is served directly, unknown routes fall
    // back to the docs SPA shell.
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/"],
    },
    entrypoint: "./worker/landing.js",
    env: {
      ASSETS: bindings.assets(),
    },
    observability: {
      enabled: true,
    },
  }),
});
