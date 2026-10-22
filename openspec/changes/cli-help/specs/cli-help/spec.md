# Spec Delta

## Purpose

Make every nzl invocation self-documenting with consistent help output and argument rules.

## ADDED Requirements

### Requirement: Global help is available

The system SHALL support `nzl --help`, `nzl -h`, and `nzl help` printing the global usage with subcommand list to stdout and exiting 0, and `nzl help <subcommand>` printing that subcommand's help.

#### Scenario: Global help exits zero

- **WHEN** a user runs `nzl --help`
- **THEN** global usage plus `run` and `schema` summaries print to stdout and the process exits 0

#### Scenario: Per-subcommand help

- **WHEN** a user runs `nzl help run`
- **THEN** run usage with `--executor` docs prints to stdout and exits 0

### Requirement: Subcommand help flags work

The system SHALL support `nzl run --help` and `nzl schema --help` printing that subcommand's help to stdout with exit 0 without executing anything.

#### Scenario: Run help does not execute

- **WHEN** a user runs `nzl run --help`
- **THEN** run help prints and no workflow file is read or executed

### Requirement: Usage errors guide to help

The system SHALL print short usage to stderr with exit 2 on invalid invocations (unknown subcommand, unknown flag, missing path, bad executor value) including a `Try 'nzl help <subcommand>'` hint.

#### Scenario: Unknown executor hints help

- **WHEN** a user runs `nzl run --executor bogus workflow.yaml`
- **THEN** an error naming the bad value plus the hint prints to stderr and the process exits 2
