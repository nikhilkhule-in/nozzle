# Tasks

Assumption recorded (design Open Question): `orchestrator/local` HTTP is Python (FastAPI) reusing the team's Python tooling; core decisions still flow through PyO3 bindings. Revisit per provider without contract changes.

## 1. UI sketch first

- [x] 1.1 Draft rough `ui/sketch/index.html` layout (workflows list, run detail with DAG placeholder, task table, trigger control, log viewer) and verify it opens in a browser with no build step
- [x] 1.2 Review sketch with stakeholder, record approved layout/navigation deltas in `ui/sketch/NOTES.md`, and verify every note has an accept/reject mark

## 2. Rust core + bindings scaffolding

- [x] 2.1 Scaffold `core/` crate (dag, refs, xcom, states, readiness, config modules) with unit tests for `next_ready` and predicate eval, and verify `cargo test` passes
- [x] 2.2 Expose PyO3 bindings with lockstep version assertion and verify a Python import calls `validate`/`next_ready` from Rust in a test
- [x] 2.3 Expose wasm-bindgen bindings for the same pure functions and verify `wasm-pack build` output loads in a Node smoke test
- [x] 2.4 Document core version-compat rule (core/SDK lockstep, asserted at registration and run creation) in `core/README.md` and verify the documented assertion triggers on a mismatched version in a test

## 3. Shared contract + conformance

- [x] 3.1 Publish canonical `shared/api/openapi.json` covering every endpoint in the contract (workflows, runs, worker register, claim/heartbeat/complete/fail, blob upload, log write/read) so new provider implementations code against it, and verify it lints plus a generated client smoke-tests each operation against the local stack
- [x] 3.2 Publish JSON Schemas for `dag_json` and the XCom envelope in `shared/schemas/`, and verify sample payloads validate against them in a test
- [x] 3.3 Build the Store conformance suite (atomic claim, lease expiry, idempotent complete, readiness, skipped propagation) in `shared/conformance/` and verify it runs green against an in-memory fake Store

## 4. Python SDK

- [x] 4.1 Evolve `@task`/`@workflow` to emit `TaskSpec` + `OutputRef` with placement hints via core validation, and verify existing simple-workflow test still passes in adapted form
- [x] 4.2 Add the future-truthiness guard (`bool(ref)` fails parse with branch guidance) plus `run_if` predicate helpers, and verify the conditional-workflow case models skip without executing the untaken branch
- [x] 4.3 Implement json + binary codecs with bytes support and loud rejection of unserializable types, and verify round-trip plus rejection tests pass
- [x] 4.4 Implement the bundle parser (workflow files to `dag_json`) with unit tests, and verify a sample project parses to schema-valid output
- [x] 4.5 Document SDK authoring (tasks, refs, predicates, placement hints, codecs) in `sdk/python/README.md` and verify every documented snippet runs as written

## 5. Local stack end-to-end (reference implementation)

- [x] 5.1 Implement `orchestrator/local` (FastAPI + SQLite store incl. per-orchestrator N default 64KB, local+git bundle config, run-pinned versions, blob/log via local filesystem) and verify the Store conformance suite passes against it
- [x] 5.2 Implement `worker/local` (register, poll/claim, heartbeat, bundle materialize, execute by task name, envelope completion, final log blob via orchestrator) and verify a two-task linear workflow runs end-to-end locally
- [x] 5.3 Verify a predicate-branched workflow runs locally with the untaken branch skipped and the join task receiving available inputs
- [x] 5.4 Verify a large-output workflow stores a blob reference (not inline bytes) and the downstream task receives equal bytes after fetch
- [x] 5.5 Document local quickstart (`orchestrator/local` + `worker/local` + sample bundle) and verify the documented commands reproduce the end-to-end run

## 6. Cloudflare stack

- [x] 6.1 Implement `orchestrator/cloudflare` (Worker HTTP over core wasm bindings, D1 store mode, Hyperdrive/Postgres mode stub or full, R2 blob/log proxy, server-side bundle config) and verify the Store conformance suite passes per mode
- [ ] 6.2 Implement `worker/cloudflare` (Container: register with self-setup ensure, poll/claim, heartbeat, git bundle fetch by pinned sha, execute, envelope completion, logs via orchestrator) and verify a two-task workflow runs end-to-end against the CF orchestrator
- [x] 6.3 Verify co-located pairing enforcement (cross-provider claim rejected) and `local`-bundle rejection for remote pools in tests
- [x] 6.4 Document CF deployment (D1, R2, Containers, Access boundary, config knobs with defaults) and verify the documented deploy reproduces the end-to-end run

## 7. Web console

- [ ] 7.1 Scaffold TanStack Start SPA (client-only static build) with shadcn setup and routing skeleton, and verify `vite build` emits `ui/dist/` served same-origin by the local orchestrator
- [ ] 7.2 Implement workflows/runs lists + manual trigger dialog with JSON validation, and verify trigger-to-detail navigation against the local stack in a browser smoke test
- [ ] 7.3 Implement run detail (task table + React Flow DAG colored by state + log viewer reading final blobs), and verify it matches the approved sketch layout
- [ ] 7.4 Verify the same `ui/dist/` bundle works unmodified against the Cloudflare orchestrator

## 8. Integration and release readiness

- [ ] 8.1 Run the full matrix (local + Cloudflare conformance, SDK tests, UI smoke) and verify everything is green in one pass
- [ ] 8.2 Record MVP defaults (poll, heartbeat, lease, max attempts, N=64KB, max single-shot blob size) and jq-verifiable config samples for both orchestrators, and verify each sample loads without warnings
