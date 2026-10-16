# Nozzle local orchestrator

FastAPI + SQLite reference implementation of the orchestrator contract
(`shared/api/openapi.json`). All scheduling decisions flow through the Rust
core via the `nozzle` SDK bindings; this package owns only I/O and state.

```bash
uv venv --python 3.12 .venv
VIRTUAL_ENV="$PWD/.venv" PATH="$PWD/.venv/bin:$PATH" uvx maturin build \
  --manifest-path ../../sdk/python/Cargo.toml --out ../../sdk/python/dist
uv pip install --python .venv/bin/python \
  ../../sdk/python/dist/nozzle-0.1.0-*.whl
uv sync --project . --group dev
.venv/bin/pytest tests/ -q
```
