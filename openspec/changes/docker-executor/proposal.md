# Proposal

## Why

Nozzle can run its own CI today only as host shell commands. Each SDK (Rust core, Python/Maturin, WASM/wasm-pack, docs/pnpm) needs a different toolchain, and host execution leaks ambient env and offers no isolation. A Docker-host executor with per-task containers lets nozzle run nozzle as a customer from day one without making CI opinionated in the engine.

## What Changes

- Add a `DockerExecutor` behind the existing `Executor` trait: each task runs as `docker run --rm <image> sh -c '<cmd>'` on the Docker host, one container per task, serial scheduling unchanged.
- Require per-task `image:` in Docker mode; `LocalExecutor` keeps image optional (absent). No blessed default distro.
- Add implicit shared work volume per run mounted at `/work` with workdir `/work`; engine creates and removes it even on failure. No `volumes:` surface in v1 (explicit workspaces later).
- Add explicit `passEnv:` allowlist per task (fail-closed); keep `env: {VAR: upstream}` as data-flow with implied edge. Docker containers receive only injected data-flow vars plus `passEnv`, never full ambient.
- Keep DAG validation, readiness (`next_ready`), first-ready serial order, blocked-drain, 64 KiB inline guard, and exit codes 0/1/2 identical across executors.
- Ship a user-space `release.yaml` for nozzle self-CI (clone + test + clippy + schema-check + wasm/py/docs builds) as acceptance, not as engine policy.

## Capabilities

### New Capabilities

- `docker-executor`: Docker-host task execution — per-task image selection, implicit per-run work volume at `/work`, explicit env passthrough, container lifecycle (`--rm`, naming, exit-code mapping, stdout capture/stderr inherit) on top of unchanged core scheduling.

### Modified Capabilities

- `workflow-yaml`: task authoring gains `image` (required under DockerExecutor, absent under LocalExecutor) and `passEnv` (optional allowlist); validation reports missing image in Docker mode and missing passthrough vars before any task runs.

## Impact

- Affected code: `runner/src/model.rs` (new optional fields), `runner/src/ingest.rs` (mapping + Docker-mode validation), `runner/src/executor.rs` (new `DockerExecutor`), `runner/src/scheduler.rs` (executor selection, no loop change), `runner/src/main.rs` (`--executor` / `DOCKER_HOST` wiring), `schemas/workflow.schema.json` (regenerated), `examples/` + docs.
- No core changes expected: `nozzle-core` stays I/O-free; spec stays the contract.
- Dependencies: Docker daemon for Docker-mode runs only; local mode unchanged.
