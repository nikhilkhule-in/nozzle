# Nozzle core (WebAssembly)

`nozzle-core` compiled via wasm-bindgen for TypeScript consumers
(future JS/TS SDKs). Same JSON-in/JSON-out surface
as the PyO3 bindings; no logic lives here.

```bash
wasm-pack build bindings/wasm --target nodejs --out-dir pkg
node bindings/wasm/test/smoke.mjs
```
