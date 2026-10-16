"""Nozzle Python SDK (MVP): workflows-as-code over the Rust core."""

from nozzle.core import (
    assert_compat,
    classify_output,
    content_hash,
    core_version,
    defaults,
    next_ready,
    task_readiness,
    validate_workflow,
)
from nozzle.sdk import OutputRef, task, workflow

assert_compat(core_version())

__all__ = [
    "OutputRef",
    "assert_compat",
    "classify_output",
    "content_hash",
    "core_version",
    "defaults",
    "next_ready",
    "task",
    "task_readiness",
    "validate_workflow",
    "workflow",
]
