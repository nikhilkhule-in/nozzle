# Proposal

## Why

Nozzle is currently a local in-memory workflows-as-code SDK (`@task`/`@workflow` building a sequential queue). There is no durable orchestrator, no distributed workers, and no shared API, so workflows cannot run outside a single process, span providers (local, Cloudflare), or be observed. This change establishes the MVP: a portable orchestrator/worker split with a stable HTTP contract, starting with Python-only monolingual workflows.

## What Changes

- Introduce per-task pull scheduling: workers short-poll `POST /tasks/claim`, heartbeat leases, complete/fail with idempotent attempts. Push/provisioning is explicitly out of scope for MVP.
- Introduce server-side workflow bundles (Airflow-style): orchestrator config declares bundle sources (`local`, `git`); runs pin a bundle version so all tasks in a run execute identical code.
- Introduce result transfer (XCom): tasks return values as references; small values inline in metadata DB, large values as blobs uploaded worker -> orchestrator -> R2. Default codecs JSON + msgpack/cbor; protobuf/capnp reserved as future opt-in codecs.
- Introduce run observability: workflow/run/task status APIs plus final-blob logs written via orchestrator (`POST /runs/:id/tasks/:id/logs`), R2 first backend.
- Introduce web console: TanStack Start SPA (static `dist/`, client-only) with shadcn components; React Flow DAG view; pages for workflows, run detail, task list, manual trigger, log viewer. Sequencing constraint: a rough `index.html` UI sketch is drafted and fine-tuned BEFORE core engine work starts.
- Establish Rust core from day one as pure logic (no I/O) with PyO3 + wasm-bindgen bindings only; no logic reimplementation in SDKs. Python-only SDK for MVP (`sdk/python`); `sdk/js|go` stubs.
- Establish provider layout: `orchestrator/{local,cloudflare}`, `worker/{local,cloudflare}`; co-located pairs only for MVP (no local-orchestrator-to-CF-workers pairing). Manual triggers only, no cron. No in-app auth; Cloudflare Access is the boundary. Inline threshold N and all timing knobs (poll, heartbeat, lease, retries) are per-orchestrator config with sensible defaults.
- Out of scope: cross-language task-to-task or workflow-to-workflow data flow (workflows are monolingual, no cross-language edges at all), cron scheduling, RBAC, push dispatch, autoscaling provisioners, chunked blob upload, Arrow/ADBC/Parquet XCom.

## Capabilities

### New Capabilities

- `task-scheduling`: per-task pull scheduling with leases, heartbeats, idempotent attempts, readiness over DAG edges, and declarative branch predicates with skipped propagation.
- `workflow-bundles`: server-side bundle configuration, version resolution, and per-run version pinning.
- `result-transfer`: XCom envelope (inline vs blob), codec negotiation, size classification, and worker-to-orchestrator-to-store upload path.
- `run-observability`: workflow/run/task status reads, manual run creation, and final-blob log write/read via orchestrator.
- `web-console`: static SPA console with workflow/run/task views, manual trigger, DAG visualization, and log viewing, starting from an `index.html` sketch.

### Modified Capabilities

- None (no existing specs; current Python SDK behavior is superseded by the new capabilities above).

## Impact

- Code: new Rust crate `core/` (PyO3 + wasm-bindgen), `sdk/python`, `orchestrator/{local,cloudflare}`, `worker/{local,cloudflare}`, `shared/api`, `ui/` (TanStack Start + shadcn + React Flow). Existing `src/nozzle` SDK migrates into `sdk/python`; current in-memory sequential semantics are replaced.
- APIs: new HTTP contract (`/workflows`, `/runs`, `/tasks/claim|heartbeat|complete|fail`, log/blob endpoints); OpenAPI in `shared/api`.
- Dependencies: Rust toolchain (cargo), maturin (PyO3 wheels), wasm-pack (Worker bindings), Vite/TS for UI, D1/Hyperdrive + R2 on Cloudflare, SQLite + filesystem locally.
- Systems: two co-located deployments for MVP (local SQLite stack, Cloudflare D1+R2+Containers stack); no cross-provider pairing.
