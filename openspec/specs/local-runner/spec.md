# local-runner Specification

## Purpose

Define in-process workflow execution: a runner that consumes a validated
workflow definition and executes its tasks on this machine by repeatedly
asking the core scheduling logic which queued tasks are ready, without any
HTTP surface, queue, or separate worker process.

## Requirements

### Requirement: Tasks execute only when the core reports them ready

The runner SHALL maintain task statuses and, at each scheduling step, SHALL
ask the core which queued tasks are ready and execute ready tasks as shell
subprocesses, one at a time. A task SHALL NOT execute before every upstream
task it depends on has succeeded.

#### Scenario: Linear workflow runs in dependency order

- **WHEN** a workflow declares task B dependent on task A
- **THEN** A executes and succeeds before B starts, and B starts no earlier
  than A's terminal state

#### Scenario: Independent tasks all execute

- **WHEN** a workflow declares two tasks with no dependency between them
- **THEN** both execute exactly once each, in definition order

### Requirement: Exit status determines task outcome

A task SHALL be marked succeeded when its command exits zero, and failed
when it exits non-zero. There are no automatic retries: a failed task stays
failed.

#### Scenario: Failing command marks the task failed

- **WHEN** a task's command exits with a non-zero status code
- **THEN** the task is marked failed, and the failure is visible in the run
  summary

### Requirement: Failure blocks downstream and fails the run

When a task fails, its downstream tasks SHALL never execute, and the run
SHALL finish as failed. The runner process SHALL exit non-zero if and only
if the run fails.

#### Scenario: Downstream of a failure never runs

- **WHEN** task A fails and task B depends on A
- **THEN** B is never executed, and the run ends as failed

#### Scenario: Runner exit code reflects the run

- **WHEN** every task succeeds
- **THEN** the runner exits zero; when any task fails, it exits non-zero

### Requirement: The run is observable on the console

The runner SHALL print, per task, its start and end with status and elapsed
time, and SHALL print a final summary listing every task with its status and
the overall run result before exiting.

#### Scenario: Summary reflects the whole run

- **WHEN** a workflow with three tasks completes (one of which was bound to
  upstream data)
- **THEN** the console shows lifecycle lines for each task and a final
  summary naming every task with its terminal status and the run result
