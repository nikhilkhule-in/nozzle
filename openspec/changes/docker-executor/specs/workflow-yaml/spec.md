# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow files parse to a validated DAG

The engine SHALL accept a workflow definition in YAML consisting of a workflow name and a list of tasks, where each task has a unique `id` and a `cmd` shell command, and tasks MAY declare `needs`, `env`, `image`, and `passEnv`. A well-formed definition SHALL convert to the engine's DAG representation (`dag_json`) and pass the core's DAG validation.

#### Scenario: Linear workflow parses and validates

- **WHEN** a YAML file declares three tasks where the second depends on the first and the third on the second
- **THEN** the engine converts it to the DAG representation and validation succeeds with no errors

#### Scenario: Fan-out and fan-in parse and validate

- **WHEN** a YAML file declares one task fanning out to two independent tasks that both fan in to a final task
- **THEN** the engine converts it to the DAG representation and validation succeeds

#### Scenario: Per-task image and passthrough parse

- **WHEN** a task declares `image: rust:1.80` and `passEnv: [GITHUB_SHA]`
- **THEN** parsing succeeds and the image and allowlist are retained for executor selection

### Requirement: Invalid definitions are rejected before execution

The engine SHALL reject a workflow definition that references a dependency that does not exist, contains a dependency cycle, declares duplicate task ids, omits a required field (task id, command, workflow name), declares a Docker-mode task without `image`, or lists a `passEnv` name the host does not define, and SHALL report every problem found in one pass rather than only the first.

#### Scenario: Unknown dependency reference rejected

- **WHEN** a task declares a dependency on a task id that is not defined
- **THEN** ingestion fails listing the unknown dependency reference, and no task is executed

#### Scenario: Dependency cycle rejected

- **WHEN** tasks A and B each declare a dependency on the other
- **THEN** ingestion fails reporting the cycle, and no task is executed

#### Scenario: Duplicate task ids rejected

- **WHEN** two tasks in one file share the same id
- **THEN** ingestion fails reporting the duplicate, and no task is executed

#### Scenario: Docker task without image rejected

- **WHEN** Docker mode is selected and a task declares no `image`
- **THEN** ingestion fails naming the task and no task is executed

#### Scenario: Missing passthrough variable rejected

- **WHEN** a task lists `passEnv: [MISSING_VAR]` the host does not define
- **THEN** ingestion fails naming the missing variable and no task is executed
