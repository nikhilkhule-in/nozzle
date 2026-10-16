"""Bundle materialization for workers.

MVP rule: tasks live in the workflow file recorded as `source.file` at
parse time. Local bundles resolve to their configured path; git bundles are
cloned once per worker and checked out at the run's pinned version.
"""

import subprocess
from pathlib import Path


def materialize(bundle, version, cache_dir="worker-bundles"):
    """Return the local directory holding `bundle` at `version`."""
    kind = bundle["type"]
    if kind == "local":
        path = Path(bundle["path"])
        if not path.is_dir():
            raise ValueError(f"local bundle path missing: {path}")
        return path
    if kind == "git":
        root = Path(cache_dir) / bundle["name"]
        if not (root / ".git").is_dir():
            root.parent.mkdir(parents=True, exist_ok=True)
            _run(["git", "clone", bundle["url"], str(root)])
        _run(["git", "-C", str(root), "fetch", "origin"], )
        _run(["git", "-C", str(root), "checkout", "--force", version or bundle.get("tracking_ref", "main")])
        return root
    raise ValueError(f"unknown bundle type: {kind}")


def _run(cmd):
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError, OSError) as e:
        raise ValueError(f"bundle command failed {' '.join(cmd)}: {e}")


def load_task(bundle_dir, source_file, code_ref):
    """Import `code_ref` (module:qualname) from the materialized bundle file."""
    import importlib.util

    module_name, _, qualname = code_ref.partition(":")
    if not module_name or not qualname or "<locals>" in qualname:
        raise ValueError(f"unimportable code reference: {code_ref}")
    path = Path(bundle_dir) / source_file
    if not path.is_file():
        raise ValueError(f"bundle file missing: {path}")
    name = f"_nozzle_exec_{module_name}"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    target = module
    for attr in qualname.split("."):
        target = getattr(target, attr)
    # @task replaces the function with its parse-time recorder; executors
    # unwrap the raw implementation through the documented escape hatch.
    target = getattr(target, "_nozzle_raw__", target)
    if not callable(target):
        raise ValueError(f"code reference is not callable: {code_ref}")
    return target
