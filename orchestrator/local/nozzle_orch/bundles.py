"""Server-side bundle configuration (Airflow-style).

Bundles are declared in orchestrator config, not in workflow code. The
orchestrator resolves a bundle to a version string at run creation and pins
the run to it; workers materialize that version themselves.
"""

import subprocess
from pathlib import Path


def resolve_version(bundle):
    """Resolve a bundle entry to its current version string (or None)."""
    kind = bundle["type"]
    if kind == "local":
        path = Path(bundle["path"])
        if not path.is_dir():
            raise ValueError(f"local bundle path missing: {path}")
        return None
    if kind == "git":
        return _git_sha(bundle["url"], bundle.get("tracking_ref", "main"))
    raise ValueError(f"unknown bundle type: {kind}")


def _git_sha(url, ref):
    try:
        out = subprocess.run(
            ["git", "ls-remote", url, ref],
            capture_output=True, text=True, timeout=30, check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError) as e:
        raise ValueError(f"cannot resolve git bundle {url}@{ref}: {e}")
    for line in out.stdout.splitlines():
        sha, _, _ = line.partition("\t")
        if sha:
            return sha
    raise ValueError(f"git bundle {url} has no ref {ref}")
