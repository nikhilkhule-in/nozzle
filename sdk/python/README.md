# Nozzle Python SDK

Workflows-as-code for Nozzle, over the Rust core (`core/`).

Build the extension and install into a venv:

```bash
uv venv --python 3.12 .venv
VIRTUAL_ENV="$PWD/.venv" PATH="$PWD/.venv/bin:$PATH" uvx maturin develop
.venv/bin/pytest tests/
```
