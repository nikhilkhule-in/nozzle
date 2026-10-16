"""Generated-client smoke over the full worker lifecycle.

Runs live only when NOZZLE_API_BASE points at an orchestrator (task 5.x);
otherwise asserts the generated client covers every operation in the
contract. Uses only the call sites produced by client_gen from openapi.json.
"""

import base64
import hashlib
import json
import os

import pytest

import client_gen

BASE = os.environ.get("NOZZLE_API_BASE")

DAG = {
    "tasks": [
        {"name": "t0", "runtime": "local-process"},
        {"name": "t1", "runtime": "local-process"},
    ],
    "edges": [{"upstream": "t0", "downstream": "t1", "arg": "x"}],
}

EXPECTED_OPS = {
    "listWorkflows", "registerWorkflow", "getWorkflow", "listRunsOfWorkflow",
    "createRun", "getRun", "registerWorker", "claimTask", "heartbeatTask",
    "completeTask", "failTask", "uploadBlob", "fetchBlob", "writeLogs", "readLogs",
}


def test_client_covers_every_operation():
    client = client_gen.Client("http://unused.invalid")
    assert EXPECTED_OPS <= set(client.routes)


@pytest.mark.skipif(not BASE, reason="needs live orchestrator (NOZZLE_API_BASE)")
def test_full_lifecycle_against_live_stack():
    client = client_gen.Client(BASE)

    status, reg = client.call("registerWorker", body={
        "worker_id": "w-smoke", "language": "python",
        "runtime": "local-process", "core_version": "0.1.0",
    })
    assert status == 200 and reg["verdict"] == "accepted", reg

    status, _ = client.call("registerWorkflow", body={
        "id": "smoke", "language": "python", "bundle": "local-dev", "dag": DAG,
    })
    assert status in (200, 201), status

    status, run = client.call("createRun", body={"workflow_id": "smoke", "inputs": {}})
    assert status == 201, run
    run_id = run["id"]

    status, first = client.call("claimTask", body={
        "worker_id": "w-smoke", "language": "python", "runtime": "local-process",
    })
    assert status == 200, first
    assert first["task_name"] == "t0"
    task_id, attempt = first["task_id"], first["attempt"]

    status, _ = client.call("heartbeatTask", path_params={"task_id": task_id},
                            body={"worker_id": "w-smoke"})
    assert status == 200, status

    payload = json.dumps({"n": 1}).encode()
    blob_body = {
        "worker_id": "w-smoke", "attempt": attempt,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "content_base64": base64.b64encode(payload).decode(),
    }
    status, ref = client.call("uploadBlob", path_params={"task_id": task_id}, body=blob_body)
    assert status == 201, ref

    envelope = {"type": "blob", "codec": "json", "size": len(payload),
                "sha256": ref["sha256"], "blob": ref}
    status, _ = client.call("completeTask", path_params={"task_id": task_id}, body={
        "worker_id": "w-smoke", "attempt": attempt, "envelope": envelope,
    })
    assert status == 200, status

    status, fetched = client.call("fetchBlob", path_params={"key": ref["key"]})
    assert status == 200 and fetched == payload, status

    status, _ = client.call("writeLogs",
                            path_params={"run_id": run_id, "task_id": task_id},
                            body={"attempt": attempt, "content": "smoke ok"})
    assert status == 201, status
    status, logs = client.call("readLogs",
                               path_params={"run_id": run_id, "task_id": task_id})
    assert status == 200, status

    status, second = client.call("claimTask", body={
        "worker_id": "w-smoke", "language": "python", "runtime": "local-process",
    })
    assert status == 200 and second["task_name"] == "t1", second
    status, verdict = client.call("failTask", path_params={"task_id": second["task_id"]}, body={
        "worker_id": "w-smoke", "attempt": second["attempt"], "error": "boom",
    })
    assert status == 200 and verdict["retry"] is True, verdict

    status, workflows = client.call("listWorkflows")
    assert status == 200 and any(w["id"] == "smoke" for w in workflows)
    status, detail = client.call("getRun", path_params={"run_id": run_id})
    assert status == 200 and len(detail["tasks"]) == 2, detail
    status, runs = client.call("listRunsOfWorkflow", path_params={"workflow_id": "smoke"})
    assert status == 200 and any(r["id"] == run_id for r in runs)
