"""Lint the canonical contract: structure, refs, and coverage."""

import json
from pathlib import Path

import client_gen

SPEC = Path(__file__).parent.parent / "openapi.json"

REQUIRED_OPERATIONS = {
    "listWorkflows", "registerWorkflow", "getWorkflow", "listRunsOfWorkflow",
    "createRun", "getRun", "registerWorker", "claimTask", "heartbeatTask",
    "completeTask", "failTask", "uploadBlob", "fetchBlob", "writeLogs", "readLogs",
}


def load():
    with open(SPEC) as f:
        return json.load(f)


def resolve_ref(spec, ref):
    assert ref.startswith("#/"), ref
    node = spec
    for part in ref[2:].split("/"):
        node = node[part]
    return node


def collect_refs(node, found):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref":
                found.add(value)
            else:
                collect_refs(value, found)
    elif isinstance(node, list):
        for value in node:
            collect_refs(value, found)


def test_valid_json_and_openapi_version():
    spec = load()
    assert spec["openapi"].startswith("3.0.")
    assert spec["info"]["title"]


def test_operation_ids_unique_and_covered():
    spec = load()
    ops = [op for op, _, _ in client_gen.operations(spec)]
    assert len(ops) == len(set(ops)), "duplicate operationId"
    assert REQUIRED_OPERATIONS <= set(ops), REQUIRED_OPERATIONS - set(ops)


def test_local_refs_resolve():
    spec = load()
    found = set()
    collect_refs(spec, found)
    for ref in found:
        if ref.startswith("#/"):
            resolve_ref(spec, ref)


def test_operations_have_responses():
    spec = load()
    for path, item in spec["paths"].items():
        for method, op in item.items():
            if isinstance(op, dict) and "operationId" in op:
                assert op.get("responses"), f"{method} {path} has no responses"
