# Spec Delta

## Purpose

The web console gives users a single static single-page application to list workflows, trigger manual runs, inspect run and task state as a graph, and read final logs.

## ADDED Requirements

### Requirement: Console ships as static client-only assets
The system SHALL serve the console as static client-only assets from the same origin as the API, with all data loaded through the public API and no server-side rendering or server functions.

#### Scenario: Same deployment serves app and API
- **WHEN** a browser loads the console from an orchestrator deployment
- **THEN** all subsequent data requests target the same origin's API endpoints

### Requirement: Users can browse workflows and runs
The system SHALL present a workflows list, a runs list with status, and a run detail view combining a task table with a DAG graph rendering nodes as tasks and edges as dependencies.

#### Scenario: Run detail visualizes DAG state
- **WHEN** a user opens a run with succeeded, running, and skipped tasks
- **THEN** the graph colors each node by state and the table shows attempt counts

### Requirement: Users can trigger manual runs
The system SHALL offer a manual trigger control accepting JSON inputs that creates a run and navigates to its detail view.

#### Scenario: Trigger from workflow view
- **WHEN** a user submits valid JSON inputs for a workflow
- **THEN** the system creates the run and shows its queued state

#### Scenario: Invalid inputs blocked client-side
- **WHEN** a user submits malformed JSON inputs
- **THEN** the trigger is blocked with a validation message and no request is sent

### Requirement: Users can read final task logs
The system SHALL render the final log blob of a selected task attempt as readable text in the run detail view.

#### Scenario: Log viewer shows stored blob
- **WHEN** a user selects a task attempt with a stored log blob
- **THEN** the viewer displays the identical log content

### Requirement: UI sketch precedes core engine work
The system change SHALL deliver a rough `index.html` sketch of the console layout for review and fine-tuning before core engine implementation begins, and the final console SHALL preserve the sketch's approved layout and navigation.

#### Scenario: Sketch approved before engine work
- **WHEN** implementation is sequenced
- **THEN** the sketch review completes before core engine tasks start
