# Design

## Context

See proposal.md Why. Current state: `src/nozzle` holds a Python-only in-memory SDK (`ContextVar` workflow assembly, `Task(func, args, kwargs)`, sequential `Workflow.__call__`) with three tests and no persistence, HTTP, or distribution. Cargo 1.99 and Python 3.14 are available. Specs in this change define pull-based per-task scheduling, server-side bundles, envelope result transfer, observability reads, and a static web console.

## Goals / Non-Goals

**Goals:**

- One Rust core crate owning all scheduling/validation logic, consumed everywhere via bindings with zero logic duplication.
- Two co-located MVP stacks sharing the HTTP contract: local (SQLite) and Cloudflare (D1/Hyperdrive + R2 + Containers).
- UI sketch (`index.html`) reviewed before any core engine work begins.

**Non-Goals:**

- Push dispatch, orchestrator-driven provisioning, autoscaling, cross-provider pairing.
- Cron, RBAC (Cloudflare Access is the boundary), chunked uploads, Arrow/ADBC/Parquet XCom, cross-language edges.

## Decisions

**Rust `core/` is pure logic, no I/O.** Exposes `validate(dag)`, `next_ready(tasks, edges)`, `eval_predicate`, `classify_envelope(size, policy, N)`, `defaults()`, `hash()`. Rationale: keeps PyO3 and wasm-bindgen surfaces small and WASM binaries lean; all DB/HTTP/fs stays in provider code. Alternative (full engine with axum/sqlx in core) rejected: would drag drivers, migrations, and dialect quirks into the shared crate and complicate WASM.

**Bindings-only SDKs (PyO3 + wasm-bindgen are must).** `sdk/python` calls core through a maturin-built extension; `orchestrator/cloudflare` consumes core through wasm-pack output. No readiness/predicate/envelope logic reimplemented in any language. Alternative (duplicate logic per language) rejected per explicit project decision. Cost accepted: contributors need the Rust toolchain or prebuilt wheels; core and SDK versions must move together (compat rule recorded in tasks).

**Pull claims, short-poll.** Workers call `POST /tasks/claim {worker_id, language, runtime}`; 204 means no work. Rationale: no inbound connectivity to workers, works behind NAT and for scale-to-zero Containers polling out; matches Prefect practice. Alternative (long-poll/WebSocket, full push) deferred: long-poll is a later optimization, push needs fleet tracking plus addressing/mTLS (see Risks).

**Leases via `lease_owner + lease_expires_at`, heartbeat renewal.** Atomic claim is each Store implementation's responsibility (D1 path uses transaction/batch; SQLite path uses a mutex; Hyperdrive/Postgres path uses row locking). The spec mandates behavior, not SQL, so DDL is never standardized.

**Server-side bundles, run-pinned versions.** Orchestrator config declares `{name, type: local|git, kwargs}`; run creation resolves and pins the version; claim responses carry it; workers materialize before executing. Rationale: Airflow-proven, guarantees uniform code across tasks claiming at different times. `local` bundles are dev-only and rejected for remote worker pools.

**Monolingual workflows, language-pinned routing.** `language` is a workflow attribute inherited by all tasks; claim filters on it. Rationale: eliminates cross-language value semantics; intermediates stay encodable with one SDK's codecs while the orchestrator treats bytes opaquely.

**Envelope result transfer, N per orchestrator.** Core classifies given N; each Store owner sets N (suggested default 64KB) plus a max single-shot size (suggested 10MB). Upload path is worker -> orchestrator -> object store so workers never hold store credentials. Codecs: `json` + binary JSON-compatible codec for MVP; `protobuf`/`capnp` reserved as opt-in per-task codecs later.

**Declarative branch predicates (`equals`/`not_equals` on JSON scalars) + `skipped` propagation.** Raw truthiness on futures fails parse with a helpful error. Rationale: serializable predicates cross heterogeneous workers; lambdas cannot. Full branch-task nodes and richer predicate sets are future extensions that fit the same tables.

**Static SPA console.** TanStack Start built client-only (`ssr: false`) to `ui/dist/`, served same-origin by both orchestrators; TanStack Query polling, Table for lists, React Flow for the DAG, shadcn/Radix + Tailwind for components. Rationale: one codebase for both stacks; SSR would need a Node server neither orchestrator provides.

**Repo layout.** `core/` (Rust) | `sdk/{python,js,go}` (python live, rest stubs) | `orchestrator/{local,cloudflare,...}` | `worker/{local,cloudflare,...}` | `shared/api` (canonical `openapi.json` every current and future provider implementation codes against) + `shared/conformance` (behavior tests every Store passes) | `ui/` | existing `src/nozzle` migrates into `sdk/python`.

## Risks / Trade-offs

- [Risk] PyO3/wasm-pack build chain slows CI and onboarding (cargo + uv/maturin + npm) → Mitigation: prebuilt wheels, pinned toolchain, `just` targets per component.
- [Risk] Core/SDK version skew changes scheduling behavior silently → Mitigation: compat rule (lockstep versions), core version asserted at worker registration and run creation.
- [Risk] Worker-mediated blob upload hairpins large payloads through the orchestrator → Mitigation: accepted for MVP (simpler creds); direct-to-store upload is a later optimization behind the same envelope.
- [Risk] Short-poll latency and idle load at scale → Mitigation: tunable poll interval; long-poll later without changing the envelope or tables.
- [Risk] Whole-run failure loses intra-run progress (no partial-result reuse yet) → Mitigation: accepted for MVP; persisted per-task outputs already stored make resume a future additive feature.
- [Risk] `bool(future)` guard changes current SDK semantics (existing conditional test relies on truthy Task) → Mitigation: SDK major behavior change documented; test updated to predicate-edge form.

## Migration Plan

Greenfield additive change: nothing deployed to migrate. `src/nozzle` in-memory semantics are superseded (breaking for current local-only users; no compatibility shim). Rollout order enforced by tasks: UI sketch review first, then core + shared contract, then local stack end-to-end, then Cloudflare stack, then conformance + docs. Rollback is per-stack redeploy of the previous bundle; runs pinned to a bundle version are unaffected by redeploys.

## Open Questions

- Exact default values for poll interval, heartbeat, lease duration, and max attempts (proposed in tasks as starting points; tunable without spec changes).
- Whether `orchestrator/local` HTTP is Python (FastAPI) or Rust (axum) — both consume core via bindings; decision affects only that provider's implementation tasks.
