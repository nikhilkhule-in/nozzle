"""Thin wrapper over the compiled Rust core extension.

Every function here delegates to `nozzle.nozzle_core_ext` (built by maturin
from `src/lib.rs`, which itself delegates to the `nozzle-core` crate). No
scheduling logic may live in this file: it exists so tracebacks and docs
point at a stable Python surface while the behavior stays in Rust.
"""

from nozzle.nozzle_core_ext import (
    assert_compat,
    classify_output,
    content_hash,
    core_version,
    defaults,
    evaluate_predicate,
    next_ready,
    task_readiness,
    validate_workflow,
)

__all__ = [
    "assert_compat",
    "classify_output",
    "content_hash",
    "core_version",
    "defaults",
    "evaluate_predicate",
    "next_ready",
    "task_readiness",
    "validate_workflow",
]
