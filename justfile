format:
    uv run ruff format

check:
    uv run ruff check

build:
    uv build

test:
    uv run pytest

build-core-ext:
    uv venv --python 3.12 sdk/python/.venv
    uv pip install --python sdk/python/.venv/bin/python pytest
    VIRTUAL_ENV="{{ justfile_directory() }}/sdk/python/.venv" PATH="{{ justfile_directory() }}/sdk/python/.venv/bin:{{ env_var('PATH') }}" uvx maturin develop --manifest-path sdk/python/Cargo.toml
