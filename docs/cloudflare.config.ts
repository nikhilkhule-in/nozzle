import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "nozzle-docs",
    "compatibilityDate": "2026-09-30",
    "domains": ["nozzle.nikhilkhule.com"],
    "assets": {
      "notFoundHandling": "single-page-application"
    },
    "observability": {
      "enabled": true
    }
  }
});
