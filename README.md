# Nozzle

A workflows-as-code engine: declare a workflow as a YAML list of shell
commands with dependencies, and the Rust core schedules and runs it in
dependency order.

```
name: build-random-image
tasks:
  - id: gen-tag
    cmd: echo "nozzle-$(date +%s)"
  - id: build
    cmd: docker build -t "$IMAGE_TAG" examples/context
    needs: [gen-tag]
    env: { IMAGE_TAG: gen-tag }
```

- `core/` — pure scheduling logic (DAG validation, readiness, states,
  result envelopes). No I/O.
- `runner/` — the `nzl` CLI (crate `nozzle-run`): loads a YAML workflow,
  validates it against the core, and executes tasks as subprocesses in
  readiness order.
- `bindings/` — wasm-bindgen surface over the core for TypeScript consumers.
- `sdk/python/` — PyO3 surface over the core for Python consumers.

## Prerequisites

- Rust toolchain (stable) for the engine, runner, and tests
- Docker (daemon running) to run the demo workflow

## Usage

```bash
cargo run -p nozzle-run -- run examples/build-random-image.yaml
# or, after installing the CLI:
#   cargo install --path runner
#   nzl run examples/build-random-image.yaml
```

Tasks run one at a time in dependency order. A task's captured stdout can
feed a downstream task's environment via an `env: {VAR: upstream-id}`
binding; oversized values are rejected rather than truncated. The process
exits zero only if every task succeeded.

## Development

```bash
just test        # workspace tests (core + runner)
just clippy      # lint
just run-demo    # build a random docker image through the engine
```

See the documentation site in [`docs/`](./docs) (fumadocs — run with
`pnpm --dir docs dev`) for the user guide and an in-depth code walkthrough,
or `openspec/` for the capability specifications.
