# Proposal

## Why

`nzl` has no `--help` or `help` command; bare invocations print a two-line usage to stderr with exit 2. Users cannot discover `run --executor`, `schema`, or exit-code semantics without reading docs.

## What Changes

- Add global `--help`/`-h` and `help [subcommand]` with per-subcommand help for `run` and `schema`.
- Document global args, `run` args (`--executor local|docker`, `--executor=` form, workflow path), and `schema` (no args).
- Standardize usage vs help output streams and exit codes; keep existing run/schema behavior unchanged.
- **BREAKING**: none for valid invocations; invalid invocations still exit 2 but now print full help to stderr.

## Capabilities

### New Capabilities

- `cli-help`: discoverable CLI contract — global help, per-subcommand help, arg kinds (global vs local), and usage/error output rules.

### Modified Capabilities

## Impact

- Affected code: `runner/src/main.rs` (arg parsing + help text), `runner/tests/run_test.rs` (help assertions), docs `reference/cli.mdx` + `guide/running.mdx` usage strings.
