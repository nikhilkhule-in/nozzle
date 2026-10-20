# Design

## Context

The branch carries the completed Rust core (`core/`: dag validation, states,
readiness, refs, xcom, config — pure logic, no I/O, 20 green tests) and its
two binding surfaces (`bindings/wasm`, `sdk/python` PyO3), plus superseded
Python scaffolding to be removed (see proposal). The core's API the runner
consumes:

- `dag::validate(&WorkflowSpec) -> Result<(), Vec<String>>` — full problem list
- `readiness::next_ready(&[TaskView], &[Edge]) -> Vec<String>` — claimable
  queued tasks in definition order; entry tasks always ready
- `states::{RunStatus, TaskStatus}` with `is_terminal()`
- `xcom::classify(size, policy, inline_threshold)` and `config::Defaults`
  (inline threshold 64 KiB)

The DAG representation (`WorkflowSpec`/`TaskSpec`/`Edge`) describes the graph
only: a `TaskSpec` has a name and a runtime string — no command payload. The
runner therefore owns task commands alongside the graph.

## Goals / Non-Goals

Goals: a `cargo run`-able engine that executes YAML-defined shell workflows
correctly ordered by the core, proven by the random-docker-image demo.

Non-Goals: retries, timeouts, parallel task execution, predicate/branch
semantics in YAML (core supports them; the YAML format does not yet expose
them), blob storage, HTTP, cancellation, cross-platform support (Linux
only).

## Decisions

### D1: Runner is a separate bin crate; core stays I/O-free

New crate `runner/` (package `nozzle-run`, bin `nozzle-run`) path-depending
on `core/`. Repo root gains a `Cargo.toml` workspace with members
`["core", "runner"]` and `exclude` for the two standalone binding packages
(`bindings/wasm`, `sdk/python`), which manage their own build flows
(wasm-pack, maturin). Alternatives: a Python runner over PyO3 bindings —
rejected: adds maturin/venv steps to every test run;
extending `core/` with a runner — rejected: violates the crate's documented
no-I/O rule.

### D2: YAML maps to the graph; commands stay runner-side

`name` -> `WorkflowSpec.id`; tasks -> `TaskSpec { name, runtime: "shell" }`;
language fixed to `"shell"`. `needs` and `env` bindings both become `Edge`s:
an `env: {VAR: upstream}` edge carries `arg = VAR`; a pure-ordering `needs`
edge carries `arg = "_"` (the core rejects empty args). The runner keeps its
own task table (`id -> cmd + env bindings`) built from the same YAML parse.
Parser: `serde_yaml` (0.9 line); the format is defined by our serde types,
so the parser library is swappable. Alternative considered: extending
`TaskSpec` with a command field — rejected: drags execution payload into the
shared graph type that other future consumers (specs, servers) would inherit.

### D3: Data flow is trimmed stdout injected as environment variables

After a task succeeds, the runner captures stdout, trims the trailing
newline, and records it per task id. A downstream task's process environment
is the parent environment plus one variable per incoming bound edge, bound
values overriding any ambient variable of the same name. Before injection,
the runner runs the captured value through `xcom::classify(len, Auto,
Defaults::inline_threshold_bytes)`; a `Blob` classification fails the run
with the size error — environment values cannot be blobs, and this dogfoods
the envelope logic with a real consumer. 64 KiB sits safely under the Linux
per-variable limit (~128 KiB).

### D4: Execution loop is sequential and fail-fast

Loop: compute `next_ready` -> execute the first returned task (definition
order) -> transition `queued -> running -> succeeded/failed` -> repeat until
all tasks are terminal -> print summary -> exit 0 iff every task succeeded.
No retries (`max_attempts` deliberately unused: it is an orchestrator-era
knob; a single-process runner has no lease to retry against — revisit when a
scheduler/worker split returns). Alternatives: parallel execution of
concurrently-ready tasks — deferred; it complicates output interleaving and
buys nothing for the demo.

### D5: Demo workflow proves real, non-cacheable execution

`examples/build-random-image.yaml`:

    name: build-random-image
    tasks:
      - id: gen-tag
        cmd: echo "nozzle-$(date +%s)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
      - id: build
        cmd: docker build -t "$IMAGE_TAG" examples/context
        env: { IMAGE_TAG: gen-tag }
      - id: verify
        cmd: docker image inspect "$IMAGE_TAG" > /dev/null
        env: { IMAGE_TAG: build }

Wait — `verify` reads the tag from `gen-tag`, not `build`; shown correctly
in the example file when written. Build context `examples/context/` holds a
minimal Dockerfile (`FROM scratch` + one `COPY`) so the build is fast and
the unique tag makes every run genuinely distinct.

### D6: Pruning removes the Python-era scaffolding

Delete `src/nozzle/`, `tests/`, `ui/sketch/`, root `pyproject.toml`,
`uv.lock`, `.python-version` (root is no longer a uv project; `sdk/python`
keeps its own maturin manifest). Rewrite `justfile` to cargo-centric recipes
(test, clippy, run-demo). Scrub the two Cloudflare doc-comment references in
`bindings/wasm/`. Optionally apply the later kebab-case boundary fix
(`PlacementPolicy` serde casing) so the engine branch owns the same
boundary naming `feat/mvp` standardized on.

## Risks / Trade-offs

- [Docker unavailable or daemon down where the runner executes] -> Demo
  fails loudly at the `build` task with docker's own error; the README
  states the prerequisite.
- [A task hangs (e.g. daemon unreachable mid-build)] -> No per-task timeout
  in this scope; run the demo under an external timeout if desired. Per-task
  timeout is the first candidate knob when the runner grows one.
- [serde_yaml is in maintenance mode] -> Format is defined by our serde
  types, not the parser; swapping the parser later is mechanical.
- [Sequential execution hides concurrency bugs the core allows] -> Accepted:
  scheduling correctness is the core's tested job; the runner's job is
  faithful, readable execution.

## Migration Plan

All work lands as commits on `engine-mvp`; nothing is deployed and no other
branch is modified. Rollback is `git revert`/branch reset. The bundled-MVP
line continues to exist independently on `feat/mvp`.

## Open Questions

- None blocking.
