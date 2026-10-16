# nozzle-core

Pure scheduling logic for the Nozzle workflow engine. No I/O: no sockets,
no filesystem, no clocks. Stores, HTTP, bundles, and blobs live in provider
code and consume this crate through language bindings (PyO3, wasm-bindgen).

Modules: `dag` (specs, predicates, validation), `readiness` (claim
decisions), `refs` (placement policy), `xcom` (envelope classification,
hashing), `states` (lifecycle), `config` (MVP defaults).

## Version-compat rule (lockstep)

Every component embeds exactly one core version and asserts equality with
every peer it talks to:

- Workers assert on registration: the orchestrator rejects registration when
  `worker_core_version != orchestrator_core_version`.
- Orchestrators assert on run creation: runs pin the core version alongside
  the bundle version, and workers refuse assignments carrying a mismatch.
- SDKs assert at import: `nozzle/__init__.py` calls
  `assert_compat(core_version())`, so authoring with a stale core fails fast
  instead of producing divergent DAG decisions.

Rationale: readiness, predicate evaluation, and envelope classification must
be bit-identical everywhere. A silent version skew would schedule different
tasks on different workers for the same run.

Enforcement helper: `assert_compat` (exact match, descriptive error).
Verified by: `cargo test compat_` in this crate, `test_lockstep_version_assertion`
in `sdk/python`, and the `assert_compat` block in `bindings/wasm/test/smoke.mjs`.
