# Tasks

## 1. Prune to the engine

- [x] 1.1 Delete `src/nozzle/`, `tests/`, `ui/sketch/`, root `pyproject.toml`, `uv.lock`, `.python-version`; verify `git status` shows only those deletions and no Python package remains at the root
- [x] 1.2 Scrub the Cloudflare doc-comment references in `bindings/wasm/README.md` and `bindings/wasm/src/lib.rs`; verify `git grep -i cloudflare -- core bindings sdk src` returns nothing
- [x] 1.3 Rewrite the `justfile` to cargo-centric recipes (`test`, `clippy`, `run-demo`); verify `just test` runs the core crate's 20 tests green
- [x] 1.4 Rewrite `README.md` for the Rust engine + YAML workflows (prerequisites: rust toolchain, docker for the demo); verify no stale Python/Cloudflare statements remain

## 2. Runner crate skeleton

- [x] 2.1 Add root `Cargo.toml` workspace with members `["core", "runner"]` and `exclude` for `bindings/wasm`; verify `cargo build` from the root compiles both members and the wasm-pack build flow is untouched
- [x] 2.2 Scaffold `runner/` as package `nozzle-run` with bin `nozzle-run` (deps: `core` path dep, `serde`, `serde_yaml`); verify `cargo run -p nozzle-run` prints usage and exits non-zero when no workflow file is given

## 3. YAML workflow ingestion (workflow-yaml)

- [x] 3.1 Define the serde types for the YAML format (`name`, tasks with `id`, `cmd`, optional `needs`, optional `env`); verify a unit test parses a sample YAML file into the types
- [x] 3.2 Map YAML to `(WorkflowSpec, runner task table)`: `name` -> id, language/runtime `"shell"`, `needs` -> edge with arg `"_"`, `env` -> edge with arg = env var name; verify a unit test asserts the converted spec's tasks and edges
- [x] 3.3 Run the core's `validate` and report every problem in one error listing; verify tests cover unknown dependency, cycle, duplicate ids, and missing fields, each asserting the listed problems and that no task executed
- [x] 3.4 Apply the kebab-case boundary fix to `PlacementPolicy` serde casing and align any policy-string parsing in the binding surfaces; verify `cargo test` and the wasm Node smoke test stay green

## 4. Execution loop (local-runner)

- [x] 4.1 Implement the sequential readiness loop: `next_ready` -> spawn `sh -c <cmd>` -> transition `queued -> running -> succeeded/failed` -> repeat until all tasks terminal; verify an integration test runs a two-task linear workflow in dependency order
- [x] 4.2 Implement stdout capture (trailing newline trimmed) and env injection per `env` bindings, bound values overriding ambient variables; verify an integration test where the downstream command echoes the bound variable and prints the upstream value
- [x] 4.3 Guard injection with `xcom::classify` against the core default inline threshold (64 KiB); verify an integration test where an upstream printing more than the threshold fails the run with a size error and the downstream never executes
- [x] 4.4 Implement failure semantics: non-zero exit marks the task failed, downstream never runs, run ends failed, process exits non-zero; verify an integration test asserting all four
- [x] 4.5 Print per-task lifecycle lines (start/end, status, elapsed) and a final summary naming every task with its terminal status and the run result; verify an integration test asserts the summary content and zero exit on success

## 5. Demo workflow

- [x] 5.1 Write `examples/build-random-image.yaml` (`gen-tag` -> `build` -> `verify` per design D5) and `examples/context/` (minimal `FROM scratch` Dockerfile + one file); verify `cargo run -p nozzle-run -- run examples/build-random-image.yaml` succeeds locally with a docker daemon
- [x] 5.2 Run the demo twice and verify the two runs produce distinct image tags and both images exist per `docker image inspect`

## Workflow follow-up

- Push `engine-mvp` to `origin` when ready; the demo (`just run-demo`) is the engine's end-to-end acceptance and runs on any machine with rust + docker.
- When the basic environment specs (docker compose, kubernetes, AWS) and the deferred Cloudflare spec are authored, archive this change and sync its two capabilities into main specs.
