# Spec Delta

## Purpose

Define the YAML workflow format the engine ingests: authors declare tasks as
shell commands with dependencies, and the engine converts the definition into
its validated DAG representation without requiring workflow code to be
written in Python. This is the authoring surface for every workflow the
runner executes.

## ADDED Requirements

### Requirement: Workflow files parse to a validated DAG

The engine SHALL accept a workflow definition in YAML consisting of a
workflow name and a list of tasks, where each task has a unique `id` and a
`cmd` shell command, and tasks MAY declare dependencies on other tasks. A
well-formed definition SHALL convert to the engine's DAG representation
(`dag_json`) and pass the core's DAG validation.

#### Scenario: Linear workflow parses and validates

- **WHEN** a YAML file declares three tasks where the second depends on the
  first and the third on the second
- **THEN** the engine converts it to the DAG representation and validation
  succeeds with no errors

#### Scenario: Fan-out and fan-in parse and validate

- **WHEN** a YAML file declares one task fanning out to two independent
  tasks that both fan in to a final task
- **THEN** the engine converts it to the DAG representation and validation
  succeeds

### Requirement: Invalid definitions are rejected before execution

The engine SHALL reject a workflow definition that references a dependency
that does not exist, contains a dependency cycle, declares duplicate task
ids, or omits a required field (task id, command, workflow name), and SHALL
report every problem found in one pass rather than only the first.

#### Scenario: Unknown dependency reference rejected

- **WHEN** a task declares a dependency on a task id that is not defined
- **THEN** ingestion fails listing the unknown dependency reference, and no
  task is executed

#### Scenario: Dependency cycle rejected

- **WHEN** tasks A and B each declare a dependency on the other
- **THEN** ingestion fails reporting the cycle, and no task is executed

#### Scenario: Duplicate task ids rejected

- **WHEN** two tasks in one file share the same id
- **THEN** ingestion fails reporting the duplicate, and no task is executed

### Requirement: Data flow binds upstream stdout to downstream environment

A task MAY declare environment bindings of the form `env: {NAME: upstream-id}`.
Each binding SHALL imply a dependency on the named upstream task (a separate
`needs` entry is not required for it), and when the upstream task succeeds,
its captured standard output (trailing newline trimmed) SHALL be exposed to
the downstream task's command as the named environment variable.

#### Scenario: Downstream command receives upstream output

- **WHEN** a task binds `IMAGE_TAG` to an upstream task whose command prints
  `nozzle-1234`, and the downstream command references `$IMAGE_TAG`
- **THEN** the downstream command executes with `IMAGE_TAG=nozzle-1234` in
  its environment

#### Scenario: Binding implies dependency ordering

- **WHEN** a task declares an environment binding on an upstream task but
  does not list it in `needs`
- **THEN** the upstream task still runs to completion before the downstream
  task starts

#### Scenario: Oversized upstream output fails the flow

- **WHEN** an upstream task's captured stdout exceeds the runner's declared
  inline threshold
- **THEN** the downstream task does not run with a silently truncated value;
  the workflow fails with an explicit size error
