# Nozzle engine — Rust core, runner, and binding surfaces.

test:
    cargo test --workspace

clippy:
    cargo clippy --workspace --all-targets -- -D warnings

# Regenerate schemas/workflow.schema.json from the loader types in runner/src/model.rs.
schema:
    cargo run -q -p nozzle-run -- schema > schemas/workflow.schema.json

run-demo:
    cargo run -p nozzle-run -- run examples/build-random-image.yaml

# wasm-bindgen surface: build for Node and run its smoke test.
build-wasm:
    wasm-pack build bindings/wasm --target nodejs --out-dir pkg

test-wasm: build-wasm
    node bindings/wasm/test/smoke.mjs

# PyO3 surface: build into a scratch venv and run its tests.
build-py:
    uv venv --clear --python 3.12 sdk/python/.venv
    uv pip install --python sdk/python/.venv/bin/python pytest
    VIRTUAL_ENV="{{ justfile_directory() }}/sdk/python/.venv" PATH="{{ justfile_directory() }}/sdk/python/.venv/bin:{{ env_var('PATH') }}" uvx maturin develop --manifest-path sdk/python/Cargo.toml

test-py: build-py
    sdk/python/.venv/bin/python -m pytest sdk/python/tests -q

# Run the docs site (fumadocs) locally at http://localhost:3000/docs
docs:
    pnpm --dir docs install
    pnpm --dir docs run dev

# Build the docs and deploy to nozzle.nikhilkhule.com (Workers + Access)
deploy-docs:
    pnpm --dir docs run build
    pnpm --dir docs run deploy
