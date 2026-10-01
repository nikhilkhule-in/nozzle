package nozzlego

//go:generate cargo build --release --manifest-path ../../Cargo.toml

/*
#cgo CFLAGS: -I${SRCDIR}/../../include
#cgo LDFLAGS: ${SRCDIR}/../../target/release/libnozzle.a -ldl -lpthread -lm
#include "nozzle.h"
*/
import "C"

// Add returns left + right using the Rust implementation.
func Add(left, right uint64) uint64 {
	return uint64(C.nozzle_add(C.uint64_t(left), C.uint64_t(right)))
}
