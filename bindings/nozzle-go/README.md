# nozzle-go

Go bindings for the `nozzle` Rust library, using `add` via cgo.

Standard single-package module layout:

```
bindings/nozzle-go/
  go.mod               # module nozzle-go
  doc.go               # package docs
  nozzle.go            # package nozzlego, cgo wrapper around nozzle_add
  nozzle_test.go       # table tests
  example_add_test.go  # runnable ExampleAdd
```

```go
import nozzlego "nozzle-go"

nozzlego.Add(2, 3) // 5
```

## Build

The Rust crate gates Python bindings behind the `python` cargo feature,
so the Go staticlib must be built **without** that feature.
Otherwise the link pulls in `Py*` symbols and fails.

From the repo root (`just build-rust` does this):

```sh
cargo build --release
```

or from this directory:

```sh
go generate ./...
go test ./...
go vet ./...
```

`go generate` runs `cargo build --release --manifest-path ../../Cargo.toml`,
which produces `target/release/libnozzle.a`. `nozzle.go` links it via:

```
#cgo CFLAGS: -I${SRCDIR}/../../include
#cgo LDFLAGS: ${SRCDIR}/../../target/release/libnozzle.a -ldl -lpthread -lm
```

with the shared header at `include/nozzle.h`.

Note: building the Python wheel rebuilds `target/release/libnozzle.a`
*with* the `python` feature. Re-run `cargo build --release`
(or `go generate`) before `go test` after that.
