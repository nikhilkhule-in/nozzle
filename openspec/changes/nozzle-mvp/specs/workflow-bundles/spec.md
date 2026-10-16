# Spec Delta

## Purpose

Server-side workflow bundles give every run a pinned, versioned snapshot of workflow code so all tasks in a run execute identical sources even when definitions change mid-run.

## ADDED Requirements

### Requirement: Bundles are declared in orchestrator configuration
The system SHALL resolve workflow code exclusively from bundles declared in orchestrator-side configuration, each naming a source type (`local` or `git`) with its location and tracking reference.

#### Scenario: Workflow references a configured bundle
- **WHEN** a workflow is registered naming a bundle present in orchestrator configuration
- **THEN** registration succeeds and records the bundle name and language

#### Scenario: Unknown bundle rejected
- **WHEN** a workflow is registered naming a bundle absent from orchestrator configuration
- **THEN** registration fails with an error naming the unknown bundle

### Requirement: Runs pin a bundle version at creation
The system SHALL resolve the bundle's current version when a run is created and record it on the run, and every task assignment for that run SHALL carry the pinned version.

#### Scenario: Version pinned at run creation
- **WHEN** a run is created for a workflow whose git bundle tracks `main` at commit `abc123`
- **THEN** the run records `abc123` and all its task assignments carry `abc123`

#### Scenario: Mid-run definition change does not affect running runs
- **WHEN** workflow definitions change after a run started
- **THEN** in-flight task assignments for that run continue to carry the originally pinned version

#### Scenario: Unversioned local bundle always resolves latest
- **WHEN** a run is created for a workflow on a `local` bundle
- **THEN** the run records an unversioned marker and workers resolve code from the local path at execution time

### Requirement: Workers materialize the pinned version before executing
The system SHALL require workers to resolve the exact pinned bundle version (checkout, download, or local path) before executing a task, and fail the attempt when the version cannot be materialized.

#### Scenario: Pinned version materialized
- **WHEN** a worker claims a task pinned to a git commit it has not yet fetched
- **THEN** the worker fetches that commit and executes the named task from it

#### Scenario: Unfetchable version fails the attempt
- **WHEN** the pinned version cannot be fetched from its source
- **THEN** the worker reports attempt failure with a bundle-resolution error instead of executing
