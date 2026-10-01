# nozzle-py

Python bindings for the `nozzle` Rust library, using `add` via PyO3/maturin.

```python
from nozzle_py import add

add(2, 3)  # 5
```

## Layout (src layout)

```
bindings/nozzle-py/
  pyproject.toml       # package name nozzle-py
  src/nozzle_py/       # import name nozzle_py
  tests/
```

## Build

Requires Python 3.12 (`uv` reads `.python-version`):

```sh
uv sync --python 3.12
uv run pytest
```

The Rust crate lives at the repo root. Maturin finds it via
`[tool.maturin] manifest-path = "../../Cargo.toml"` and builds the
`python` cargo feature (`nozzle_py._core` extension).
