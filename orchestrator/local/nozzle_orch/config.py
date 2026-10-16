"""Orchestrator knobs. Defaults come from the Rust core; a JSON config file
overrides them. No default value is written here twice."""

import json
from dataclasses import dataclass


@dataclass
class Knobs:
    poll_interval_secs: int = 10
    heartbeat_secs: int = 15
    lease_secs: int = 60
    max_attempts: int = 3
    inline_threshold: int = 65536
    max_blob_bytes: int = 10 * 1024 * 1024
    provider: str = "local"
    db_path: str = "nozzle.db"
    blob_dir: str = "blobs"
    log_dir: str = "logs"
    ui_dist: str = ""
    bundles: tuple = ()


def from_core():
    """Defaults straight from `core/src/config.rs` via bindings."""
    from nozzle import defaults as core_defaults

    data = json.loads(core_defaults())
    return Knobs(
        poll_interval_secs=data["poll_interval_secs"],
        heartbeat_secs=data["heartbeat_secs"],
        lease_secs=data["lease_secs"],
        max_attempts=data["max_attempts"],
        inline_threshold=data["inline_threshold_bytes"],
        max_blob_bytes=data["max_blob_bytes"],
    )


def load(path=None):
    """Load knobs: core defaults overlaid with a JSON config file."""
    knobs = from_core()
    if path is None:
        return knobs
    with open(path) as f:
        overrides = json.load(f)
    for key, value in overrides.items():
        if not hasattr(knobs, key):
            raise ValueError(f"unknown orchestrator knob: {key}")
        setattr(knobs, key, tuple(value) if key == "bundles" else value)
    return knobs
