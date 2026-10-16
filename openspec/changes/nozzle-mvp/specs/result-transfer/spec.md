# Spec Delta

## Purpose

Result transfer moves task outputs between workers through the orchestrator, keeping small values inline in metadata storage and large values as referenced blobs.

## ADDED Requirements

### Requirement: Task outputs are transferred as envelopes
The system SHALL represent every task output as an envelope carrying a type (`inline` or `blob`), a codec tag, a byte size, and a content hash, so the orchestrator can route values without interpreting them.

#### Scenario: Small output stored inline
- **WHEN** a worker completes a task whose encoded output is below the orchestrator's inline threshold
- **THEN** the value travels inside the completion report and is stored with the task record

#### Scenario: Large output stored by reference
- **WHEN** a worker completes a task whose encoded output meets or exceeds the inline threshold
- **THEN** the completion carries a blob reference (backend, key, size, hash) instead of the value bytes

#### Scenario: Core never interprets payload bytes
- **WHEN** the orchestrator stores or forwards an envelope
- **THEN** it validates size and hash only and never deserializes the payload

### Requirement: Author hints constrain placement
The system SHALL honor per-task placement hints (`auto`, `inline-only`, `blob-only`) recorded at workflow parse time when classifying outputs at completion time.

#### Scenario: Inline-only overflow fails the attempt
- **WHEN** a task hinted `inline-only` completes with an output above the inline threshold
- **THEN** the attempt fails with a placement error and no output is stored

#### Scenario: Blob-only always references storage
- **WHEN** a task hinted `blob-only` completes with a tiny output
- **THEN** the output is still stored as a blob reference

### Requirement: Supported codecs cover JSON-like values plus bytes
The system SHALL support `json` and a binary JSON-compatible codec for task inputs and outputs, restricted to JSON-like values plus byte strings; custom classes without explicit conversion SHALL be rejected at encode time.

#### Scenario: JSON-like round trip
- **WHEN** a task returns nested dicts, lists, strings, numbers, booleans, null, or bytes
- **THEN** a downstream task in the same workflow language receives an equal value

#### Scenario: Unserializable value rejected loudly
- **WHEN** a task returns a custom object with no declared conversion
- **THEN** encoding fails with an error naming the offending type instead of silently pickling

### Requirement: Blob upload travels through the orchestrator
The system SHALL accept large output bytes via an orchestrator-mediated upload endpoint, with the orchestrator persisting them to its configured object store and returning the blob reference used in the completion envelope.

#### Scenario: Upload then complete by reference
- **WHEN** a worker uploads output bytes and completes the task with the returned reference
- **THEN** a downstream worker can fetch the identical bytes through the orchestrator

#### Scenario: Hash mismatch rejected
- **WHEN** uploaded bytes do not match the declared content hash
- **THEN** the orchestrator rejects the upload and stores nothing

### Requirement: Downstream inputs resolve transparently
The system SHALL deliver each task assignment with its inputs either inline or as fetchable references, and workers SHALL resolve references before executing user code.

#### Scenario: Blob input fetched before execution
- **WHEN** a claimed task has an input stored as a blob reference
- **THEN** the worker fetches the bytes through the orchestrator and decodes them prior to execution
