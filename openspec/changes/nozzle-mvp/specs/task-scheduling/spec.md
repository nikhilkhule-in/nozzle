# Spec Delta

## Purpose

Per-task pull scheduling lets any number of workers share the execution of a workflow run, with the orchestrator deciding which pending task goes to whichever worker asks next.

## ADDED Requirements

### Requirement: Workers claim ready tasks by polling
The system SHALL expose a task-claim operation where a registered worker presenting its identity, language, and runtime receives the next ready task for that language and runtime, or an explicit no-work response when none is ready.

#### Scenario: Claim returns next ready task
- **WHEN** a registered Python worker polls for work and a queued task in the same language has all dependencies satisfied
- **THEN** the system returns exactly one task assignment including run, task, attempt number, inputs, and bundle version

#### Scenario: Claim returns no-work when nothing is ready
- **WHEN** a worker polls and no queued task matches its language and runtime or all matching tasks are blocked on unfinished predecessors
- **THEN** the system returns an explicit no-work response and creates no lease

#### Scenario: Co-located pairing enforced
- **WHEN** a worker from one provider network polls an orchestrator from a different provider network
- **THEN** the system rejects the claim as unpairable for MVP

### Requirement: Task leases prevent double execution
The system SHALL grant each claimed task a lease owned by the claiming worker with a bounded expiry, renewable by heartbeat, so a crashed worker's task becomes claimable again after expiry.

#### Scenario: Heartbeat extends lease
- **WHEN** the owning worker sends a heartbeat before lease expiry
- **THEN** the system extends the lease and keeps the task in running state

#### Scenario: Expired lease releases task
- **WHEN** the lease expires without heartbeat or completion
- **THEN** the system returns the task to queued state with an incremented attempt count and makes it claimable by another worker

#### Scenario: Foreign completion rejected
- **WHEN** a worker that does not own the lease reports completion
- **THEN** the system rejects the report and preserves the current owner's state

### Requirement: Task completion and failure are idempotent per attempt
The system SHALL accept completion and failure reports keyed by run, task, and attempt, ignoring duplicate reports for an already-terminal attempt.

#### Scenario: Duplicate completion ignored
- **WHEN** a worker reports completion twice for the same attempt
- **THEN** the second report is acknowledged without changing stored results

#### Scenario: Failure records error and schedules retry
- **WHEN** a worker reports failure for an attempt below the configured maximum attempts
- **THEN** the system records the error, increments the attempt count, and returns the task to queued state

#### Scenario: Attempts exhausted marks task failed
- **WHEN** a worker reports failure for the final permitted attempt
- **THEN** the system marks the task failed and blocks its downstream dependents

### Requirement: Downstream readiness follows DAG edges
The system SHALL make a task claimable only when every upstream edge is satisfied: each predecessor is in a terminal state consistent with the edge predicate.

#### Scenario: Linear chain unblocks in order
- **WHEN** task t1 succeeds and task t2 depends on t1 with no predicate
- **THEN** t2 becomes claimable

#### Scenario: Blocked task is not claimable
- **WHEN** task t2 depends on t1 and t1 has not reached a terminal state
- **THEN** t2 is not returned by any claim operation

### Requirement: Branch predicates gate downstream execution
The system SHALL support declarative predicates (`equals`, `not_equals` over JSON scalar values) on dependency edges, evaluating them against the predecessor's materialized output to decide whether the downstream task runs or is skipped.

#### Scenario: Predicate match runs downstream
- **WHEN** edge t1->t2 carries `equals true` and t1 outputs `true`
- **THEN** t2 becomes claimable once t1 succeeds

#### Scenario: Predicate mismatch skips downstream
- **WHEN** edge t1->t2 carries `equals true` and t1 outputs `false`
- **THEN** t2 transitions to skipped without executing

#### Scenario: Skipped parents propagate through joins
- **WHEN** a task has multiple upstreams and all are terminal with at least one skipped and predicates otherwise satisfied
- **THEN** the task becomes claimable with only the available inputs

### Requirement: Workflow authoring forbids implicit branching on futures
The system SHALL fail workflow parsing with a descriptive error when user code applies truthiness testing to an unresolved task output reference instead of declaring a predicate edge.

#### Scenario: Raw conditional on future rejected
- **WHEN** workflow definition code evaluates a task output reference in a boolean context during parsing
- **THEN** parsing fails with an error directing the author to the declarative branch construct
