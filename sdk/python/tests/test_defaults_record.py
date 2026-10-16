"""Task 8.2 verification: sample configs for both orchestrators load clean
and match the Rust core defaults (single source of truth)."""

import json
import tomllib
from pathlib import Path

from nozzle import defaults as core_defaults

ROOT = Path(__file__).parent.parent.parent.parent


def test_local_sample_matches_core():
    import sys

    sys.path.insert(0, str(ROOT / "orchestrator" / "local"))
    from nozzle_orch import config as orch_config

    sample = ROOT / "orchestrator" / "local" / "sample.orch.json"
    knobs = orch_config.load(str(sample))
    core = json.loads(core_defaults())
    assert knobs.poll_interval_secs == core["poll_interval_secs"] == 10
    assert knobs.heartbeat_secs == core["heartbeat_secs"] == 15
    assert knobs.lease_secs == core["lease_secs"] == 60
    assert knobs.max_attempts == core["max_attempts"] == 3
    assert knobs.inline_threshold == core["inline_threshold_bytes"] == 65536
    assert knobs.max_blob_bytes == core["max_blob_bytes"] == 10 * 1024 * 1024


def test_cloudflare_sample_matches_core_and_wrangler():
    sample = json.load(open(ROOT / "orchestrator" / "cloudflare" / "sample.vars.json"))
    core = json.loads(core_defaults())
    assert int(sample["LEASE_SECS"]) == core["lease_secs"] == 60
    assert int(sample["MAX_ATTEMPTS"]) == core["max_attempts"] == 3
    assert int(sample["INLINE_THRESHOLD"]) == core["inline_threshold_bytes"] == 65536
    assert int(sample["MAX_BLOB_BYTES"]) == core["max_blob_bytes"] == 10 * 1024 * 1024
    assert sample["PROVIDER"] == "cloudflare"
    assert sample["STORE_MODE"] == "d1"

    with open(ROOT / "orchestrator" / "cloudflare" / "wrangler.toml", "rb") as f:
        wrangler = tomllib.load(f)
    assert wrangler["vars"]["PROVIDER"] == sample["PROVIDER"]
    assert wrangler["vars"]["STORE_MODE"] == sample["STORE_MODE"]
    assert wrangler["vars"]["LEASE_SECS"] == sample["LEASE_SECS"]
    assert wrangler["vars"]["MAX_ATTEMPTS"] == sample["MAX_ATTEMPTS"]
    assert wrangler["vars"]["INLINE_THRESHOLD"] == sample["INLINE_THRESHOLD"]
    assert wrangler["vars"]["MAX_BLOB_BYTES"] == sample["MAX_BLOB_BYTES"]
