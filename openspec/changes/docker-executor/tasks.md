# Tasks

## 1. YAML surface and ingestion

- [x] 1.1 Add `image: Option<String>` and `passEnv: Vec<String>` with `#[serde(default)]` to `TaskYaml` and `TaskDef`, regenerate schema via `just schema`, and verify `schemas/workflow.schema.json` diff shows both fields optional
- [x] 1.2 Enforce Docker-mode validation in ingest (missing `image` per task, missing host var for `passEnv`, aggregated with existing core errors) and verify new `load_str` unit tests fail with named problems and run zero tasks
- [x] 1.3 Document `image` / `passEnv` in `yaml-reference.mdx` with local-vs-Docker table and verify documented YAML parses with `nzl schema` validation

## 2. Docker executor and work volume

- [x] 2.1 Implement `DockerExecutor` behind `Executor` (`docker run --rm -v <vol>:/work -w /work -e VAR ... --name nozzle-<run>-<task> <image> sh -c '<cmd>'`, stdout piped + trimmed, stderr inherited, exit-code mapping) and verify unit tests for arg construction plus a hello-world container run
- [x] 2.2 Manage implicit per-run volume lifecycle (create before first task, mount every task, remove even on failure/interrupt) and verify `docker volume ls` shows no leaked `nozzle-*` after a failing run
- [x] 2.3 Resolve daemon from `DOCKER_HOST` or default socket with preflight check and verify unreachable daemon fails before execution with a clear error and exit 2

## 3. Scheduler and CLI wiring

- [x] 3.1 Wire `--executor local|docker` (default local) through `main.rs` into `scheduler::run` with no loop change and verify existing `just test` plus `run-demo` still pass in local mode
- [x] 3.2 Preserve run semantics across executors (serial first-ready order, blocked-drain, 64 KiB guard, exit 0/1/2, lifecycle lines) and verify integration tests cover Docker-mode ordering and blocked downstream

## 4. Self-CI acceptance and docs

- [x] 4.1 Author user-space `examples/release.yaml` (clone via `alpine/git` then `test`/`clippy` on `rust`, `build-py` on `python`, `build-wasm` on `node`, docs build) with explicit `passEnv` and verify `nzl run --executor docker examples/release.yaml` succeeds on a Docker host
- [x] 4.2 Update `cli.mdx` / `running.mdx` executor docs and check in regenerated schema, then verify docs build and the documented commands run as written
