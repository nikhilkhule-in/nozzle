# Proposal

## Why

The bundled MVP (`nozzle-mvp` on `feat/mvp`) scopes the MVP as a full orchestrator/worker stack with Cloudflare as a co-equal deployment target. After review, Cloudflare should be its own spec, sequenced only after basic deployment environments (docker compose, kubernetes, AWS) exist. The MVP is redefined as the core engine alone, validated by using it — the engine's first real job is running a CI/CD-shaped workflow that builds a random docker image from a YAML definition.

## What Changes

- **BREAKING**: MVP scope narrows to the core engine. The orchestrator/worker HTTP stack, contract, bundles, UI, and all deployment targets move out of MVP scope; Cloudflare becomes a separate future spec deferred until the basic environment specs (docker compose, kubernetes, AWS) are implemented.
- Prune the branch to the engine: keep `core/` (Rust scheduling logic), `bindings/wasm/` and `sdk/python/` (engine binding surfaces); remove `src/nozzle/` (superseded in-memory SDK), `tests/` (its tests), `ui/sketch/`, and stale bundled-MVP planning artifacts; scrub residual Cloudflare references (e.g. wasm binding doc comments).
- Introduce YAML workflow ingestion (`workflow-yaml`): workflow definitions in YAML are parsed to `dag_json` and validated by the core. Tasks are shell commands with `needs:` dependency edges; minimal data flow captures an upstream task's stdout and exposes it to downstream task environments.
- Introduce the in-process runner (`local-runner`): a small Rust binary crate that loops over core scheduling (`next_ready`, state transitions), executes tasks as subprocesses, and runs workflows to terminal states. The runner owns all I/O so `core/` stays pure logic.
- Add the validation workflow `examples/build-random-image.yaml` (generate random tag -> docker build -> verify image) with a minimal build context.

Out of scope: HTTP contract and client generation, orchestrator/worker split, leases and heartbeats, server-side bundles, XCom blobs, web console, cron, and all remote deployment targets.

## Capabilities

### New Capabilities

- `workflow-yaml`: YAML workflow definition format — task and dependency parsing to `dag_json`, core validation, and the stdout-to-environment data-flow rule between dependent tasks.
- `local-runner`: in-process workflow execution over core scheduling — readiness loop, subprocess task execution, state transitions through to terminal states, and run summary with exit status.

### Modified Capabilities

None (no existing specs; the bundled-MVP artifacts describe work tracked on `feat/mvp`, not this branch).

## Impact

- Code: new small runner crate (bin) depending on `core/`; deletions of `src/nozzle/`, `tests/`, `ui/sketch/`, and stale planning docs; doc-comment scrub in `bindings/wasm/`. `core/` logic itself is unchanged.
- APIs: none — no HTTP surface in this scope.
- Dependencies: `serde`/YAML parsing for the runner; docker CLI and daemon required where the demo workflow runs.
- Systems: single-process local execution.
