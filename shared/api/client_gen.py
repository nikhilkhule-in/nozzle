"""Minimal client generated from shared/api/openapi.json.

Maps each operationId to (method, path template) and performs calls with
urllib (stdlib only). The smoke test drives the full worker lifecycle
through these generated call sites, so every operation in the contract is
exercised against a live orchestrator.
"""

import json
import urllib.request
from pathlib import Path

SPEC_PATH = Path(__file__).with_name("openapi.json")


def load_spec(path=SPEC_PATH):
    with open(path) as f:
        return json.load(f)


def operations(spec):
    """Yield (operationId, method, path template) for every operation."""
    ops = []
    for path, item in spec["paths"].items():
        for method, op in item.items():
            if not isinstance(op, dict) or "operationId" not in op:
                continue
            ops.append((op["operationId"], method.upper(), path))
    return ops


class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.spec = load_spec()
        self.routes = {op: (method, path) for op, method, path in operations(self.spec)}

    def call(self, operation, path_params=None, query=None, body=None):
        from urllib.parse import urlencode

        method, template = self.routes[operation]
        path = template
        for key, value in (path_params or {}).items():
            path = path.replace("{" + key + "}", str(value))
        url = self.base + path
        if query:
            url += "?" + urlencode(query)
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            url, data=data, method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request) as response:
                raw = response.read()
                ctype = response.headers.get("Content-Type", "")
                return response.status, (
                    json.loads(raw) if "application/json" in ctype and raw else raw
                )
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw) if raw else None
            except ValueError:
                return e.code, raw
