import { initSync } from "../pkg-web/nozzle_core_wasm.js";
import wasmModule from "../pkg-web/nozzle_core_wasm_bg.wasm";

// Workers hand us the raw WebAssembly.Module for .wasm imports, so the
// wasm-bindgen bundler glue (which expects its bundler to instantiate)
// cannot self-start. Initialize synchronously once at isolate startup;
// every core export below is usable after this line.
initSync({ module: wasmModule as unknown as WebAssembly.Module });

export * from "../pkg-web/nozzle_core_wasm.js";
