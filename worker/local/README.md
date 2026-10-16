# Nozzle local worker

Polls an orchestrator, executes bundle tasks in-process, and reports back.
All scheduling decisions live in the Rust core; this package owns only
polling, bundle materialization, execution, and reporting.

```bash
uv sync --project . --group dev
```
