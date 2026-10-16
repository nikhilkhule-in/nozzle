# Spec Delta

## Purpose

Run observability exposes workflow, run, and task state plus final task logs through the orchestrator so users can track and debug manual runs without inspecting worker hosts.

## ADDED Requirements

### Requirement: Manual run creation starts a queued run
The system SHALL create a run in queued state from a workflow identifier plus JSON inputs, expanding its tasks from the workflow definition and pinned bundle version.

#### Scenario: Manual trigger creates run
- **WHEN** a client submits a workflow identifier with valid JSON inputs
- **THEN** the system returns a run identifier with status queued and its tasks queued

#### Scenario: Unknown workflow rejected
- **WHEN** a client submits an unregistered workflow identifier
- **THEN** creation fails with a not-found error and no run is recorded

### Requirement: Run and task state is readable
The system SHALL expose read operations returning workflow definitions, run status with timestamps, and per-task status including state, attempt count, lease ownership, and error text.

#### Scenario: Run detail shows task states
- **WHEN** a client reads a run with one succeeded and one running task
- **THEN** the response reports both task states with attempt counts and timestamps

### Requirement: Task logs are written once as a final blob
The system SHALL accept exactly one final log blob per task attempt through the orchestrator, persisting it to the configured log store and serving it back on read.

#### Scenario: Final log stored and readable
- **WHEN** a worker submits the final log blob for an attempt
- **THEN** subsequent reads of that task return the identical log content

#### Scenario: Duplicate log submission rejected
- **WHEN** a worker submits a second final log blob for the same attempt
- **THEN** the system rejects the duplicate and preserves the first blob

### Requirement: Orchestrator mediates all log and blob storage
The system SHALL NOT require workers to hold object-store credentials; all log and blob writes travel through orchestrator endpoints that persist to the orchestrator's configured backends.

#### Scenario: Worker without store credentials succeeds
- **WHEN** a worker with no object-store credentials completes a large output and submits logs
- **THEN** both persist successfully via the orchestrator
