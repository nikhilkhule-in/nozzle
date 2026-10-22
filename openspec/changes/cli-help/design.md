# Design

## Context

See proposal.md Why. Current `runner/src/main.rs:14` matches exact arg shapes; anything else prints two-line `USAGE` to stderr, exit 2. No `--help`, no `help`, no per-subcommand docs.

## Goals / Non-Goals

**Goals:**

- `--help`/`-h` global + per-subcommand, `help [sub]` alias, usage/error stream rules.
- Zero behavior change for valid `run`/`schema` invocations.

**Non-Goals:**

- No clap-style framework; keep std-only manual parsing with a small help-text module.
- No shell completion, man pages, or `help` for undocumented flags.

## Decisions

- **Manual parser extension, not a dependency.** Rationale: runner is std-only (plus core/schemars/serde); adding clap churns the lockfile for two subcommands. Alternative clap considered — richer, but overkill here.
- **Help to stdout/exit 0; errors to stderr/exit 2 with hint.** Rationale: matches Unix convention and existing exit-code contract (`0` success, `2` usage). `run --help` short-circuits before file reads.
- **`run` accepts `--executor X` and `--executor=X`, plus positional workflow path; `schema` takes no args.** Rationale: preserves current accepted forms while documenting them; unknown flags fall through to usage error.

## Risks / Trade-offs

- [Manual parsing drifts from docs] → Mitigation: single `help_text` source used by both `--help` paths and asserted in integration tests; docs copy the same strings.
- [Flag ordering variants] → Mitigation: support only documented orders (`nzl run [--executor ...] <path>`, `nzl [--help]` global); everything else is a usage error with hint.

## Migration Plan

- Additive: existing valid commands keep working with identical output plus no changes to run semantics. Rollback: revert `main.rs`.
