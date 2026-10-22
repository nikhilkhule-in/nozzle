# Tasks

## 1. Help implementation

- [x] 1.1 Add global `--help`/`-h`, `help [subcommand]`, and per-subcommand `run --help`/`schema --help` with stdout/exit 0 and verify `nzl --help`, `nzl help run`, `nzl run --help` print and exit 0 without executing
- [x] 1.2 Standardize usage errors (unknown subcommand/flag, missing path, bad executor) to stderr/exit 2 with `Try 'nzl help <subcommand>'` hint and verify existing invalid-invocation tests still pass
- [x] 1.3 Update `reference/cli.mdx` and `guide/running.mdx` usage strings to the new help text and verify documented commands run as written
