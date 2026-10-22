# Design

## Context

See proposal.md Why. Current state: `Executor` trait in `runner/src/executor.rs` with `LocalExecutor` spawning `sh -c` on the host; scheduler loop in `runner/src/scheduler.rs` takes `ready.first()` serially; ingest in `runner/src/ingest.rs` maps `needs` to `ORDER_ARG` edges and `env` to data edges with `TaskSpec.runtime` hardcoded to `"shell"`. Core stays I/O-free. Docker support is anticipated in docs but absent.

## Goals / Non-Goals

**Goals:**

- One container per task on the Docker host with per-task `image`, shared implicit work volume, and explicit env only.
- Zero scheduler or core changes; same DAG, readiness, drain, and 64 KiB guard.
- Local mode keeps working with no `image`.

**Non-Goals:**

- No `volumes:` / `workspaces:` surface, no matrix, retries, timeouts, services, triggers, reusable `uses:`, cache policy, or registry auth helpers. Users emulate with shell (`timeout`, retry loops) and plain tasks.
- No parallel execution; serial first-ready stays.
- No file-artifact store beyond the shared work volume and inline stdout.

## Decisions

- **Shell out to `docker` CLI, not a client crate.** Rationale: keeps core I/O-free and matches `LocalExecutor` spawning processes; no new dependency. Alternative `bollard` considered — richer API but async runtime and version skew with daemon.
- **`image: Option<String>` in model, required only in Docker mode.** Rationale: preserves existing local YAML (`build-random-image.yaml` has no image) and generated JSON Schema; Docker-mode validation in ingest fails fast with `task X declares no image`. Alternative of making it required in serde breaks local.
- **Implicit anonymous volume `nozzle-<run>` at `/work`, workdir `/work` for all tasks.** Rationale: minimal surface agreed (implicit first); makes clone-once expressible without host paths, works on remote daemons. Alternative bind-mount `$PWD` is faster locally but breaks remote and leaks host layout.
- **`passEnv: Vec<String>` separate from `env` data-flow map.** Rationale: `env` already means `VAR -> upstream-id` with implied edge; overloading it with literals conflates ordering and passthrough. Fail-closed on missing host var before any task runs.
- **Container naming `nozzle-<run>-<task>`, `--rm`, stderr inherit + stdout pipe.** Rationale: mirrors `LocalExecutor` observability; naming aids `docker ps` and `docker kill` on timeout/cancel later.
- **Daemon via `DOCKER_HOST` or default socket, checked before first task.** Rationale: standard Docker convention, no new config file.

## Risks / Trade-offs

- [N clones if users clone per task] → Mitigation: document clone-once via shared `/work` as the blessed pattern; provide `release.yaml` example.
- [Cold caches: each image starts without `cargo-target`/`uv`/`pnpm` state] → Mitigation: user-space cache volumes later; v1 accepts cold builds, note in docs.
- [`pkg/` and other file outputs exceed inline guard] → Mitigation: files stay on work volume as the artifact path; guard still applies only to captured stdout bound via `env`.
- [Root-owned files on shared volume] → Mitigation: document `--user` follow-up; v1 runs as image default like GHA.
- [Image pull latency per task] → Mitigation: serial pulls amortize; recommend pinned tags.

## Migration Plan

- Additive only: new optional YAML fields, new executor, `--executor docker|local` (default local). Existing workflows and `just` recipes run unchanged.
- Regenerate `schemas/workflow.schema.json` via `just schema`.
- Rollback: run with `--executor local`.

## Open Questions

- None blocking specs or tasks. Future explicit `workspaces:` shape and per-task `--user` / resource limits deferred to a later change.
