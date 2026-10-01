default:
    @just test

# Build Rust core (without `python` feature -> lean staticlib for Go).
build-rust:
    cargo build --release

# Build Rust core with Python bindings enabled (what maturin does).
build-rust-python:
    cargo build --release --features python

# Run all tests: Rust, Python, Go.
test: test-rust test-python test-go

test-rust:
    cargo test
    cargo test --features python

test-python:
    cd bindings/nozzle-py && uv sync --python 3.12 && uv run pytest

# Go links target/release/libnozzle.a, so rebuild it first.
test-go: build-rust
    cd bindings/nozzle-go && go vet ./... && go test -count=1 ./...

sync-python:
    cd bindings/nozzle-py && uv sync --python 3.12

fmt:
    cargo fmt --check
    cd bindings/nozzle-go && gofmt -l . && go vet ./...
