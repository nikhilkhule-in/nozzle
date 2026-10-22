# Spec Delta

## Purpose

Run every task in its own container on the Docker host while keeping scheduling, validation, and data-flow semantics identical to local execution.

## ADDED Requirements

### Requirement: Tasks run in per-task containers on the Docker host

The system SHALL execute each task as a single `docker run --rm` container using that task's declared `image`, running `sh -c '<cmd>'` with workdir `/work`. Scheduling stays serial first-ready in definition order with no concurrency change.

#### Scenario: Per-task images run serially

- **WHEN** a workflow declares `build` with `image: rust:1.80` and `docs` with `image: node:20` and no dependency between them
- **THEN** each runs in its own container with its own image, one after the other in definition order, and the run succeeds only if both succeed

#### Scenario: Exit code maps to task outcome

- **WHEN** a container command exits non-zero
- **THEN** that task is marked failed with the exit status as its note and downstream drains as blocked without execution

### Requirement: Shared work volume is implicit

The system SHALL create one anonymous volume per run, mount it at `/work` for every task container with workdir `/work`, and remove it after the run ends even when tasks fail. No per-task volume configuration exists in v1.

#### Scenario: Files persist across tasks via shared volume

- **WHEN** `clone` writes the repo to `/work` and `test` later lists `/work`
- **THEN** `test` sees what `clone` wrote without declaring any volume

#### Scenario: Volume is cleaned up on failure

- **WHEN** any task fails
- **THEN** the per-run volume is still removed and no anonymous volume is leaked

### Requirement: Environment is explicit plus data-flow only

The system SHALL expose to each container only data-flow bindings from `env: {VAR: upstream}` plus names listed in `passEnv`, and SHALL NOT inherit unlisted host ambient variables. A missing `passEnv` name SHALL fail validation before any task runs.

#### Scenario: Passthrough allowlist is honored

- **WHEN** a task declares `passEnv: [GITHUB_SHA]` and the host provides it
- **THEN** the container sees `GITHUB_SHA` with the host value

#### Scenario: Ambient does not leak

- **WHEN** the host defines `SECRET_TOKEN` not listed in `passEnv` and not bound via `env`
- **THEN** the container does not see `SECRET_TOKEN`

#### Scenario: Missing passthrough fails fast

- **WHEN** a task lists `passEnv: [MISSING_VAR]` the host does not define
- **THEN** ingestion fails naming the missing variable and no task executes

### Requirement: Docker host and lifecycle are contained

The system SHALL resolve the daemon from `DOCKER_HOST` or the default socket, name containers `nozzle-<run>-<task>`, stream stderr live while capturing stdout for data-flow, and apply the existing 64 KiB inline guard unchanged.

#### Scenario: Daemon unreachable fails before execution

- **WHEN** no daemon is reachable at the resolved host
- **THEN** the run fails with a clear daemon error and no task is marked succeeded

#### Scenario: Container output feeds downstream

- **WHEN** an upstream prints a tag and a downstream binds it via `env: {IMAGE_TAG: gen-tag}`
- **THEN** the downstream container receives `IMAGE_TAG` with trailing newlines trimmed or the producer fails on oversize with an explicit size error
