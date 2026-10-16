# Nozzle local orchestrator

FastAPI + SQLite reference implementation of the orchestrator contract
(`shared/api/openapi.json`). All scheduling decisions flow through the Rust
core via the `nozzle` SDK bindings; this package owns only I/O and state.

```bash
uv sync --project . --group dev
.venv/bin/pytest tests/ -q
```
