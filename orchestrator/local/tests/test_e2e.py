"""Task 5.2 verification: two-task linear workflow end to end on the local
stack (real HTTP via in-process uvicorn + polling worker)."""

import json
import shutil
import threading
import time
from pathlib import Path

import httpx
import pytest
import uvicorn

from nozzle.bundles import parse_file
from nozzle_orch.app import create_app
from nozzle_worker.worker import Worker

ROOT = Path(__file__).resolve().parent.parent.parent.parent


@pytest.fixture
def stack(tmp_path):
    bundle_dir = tmp_path / "bundle"
    bundle_dir.mkdir()
    shutil.copy(ROOT / "sdk" / "python" / "tests" / "sample_bundle" / "etl.py",
                bundle_dir / "etl.py")
    config = {
        "db_path": ":memory:",
        "blob_dir": str(tmp_path / "blobs"),
        "log_dir": str(tmp_path / "logs"),
        "bundles": [{"name": "local-dev", "type": "local",
                     "path": str(bundle_dir)}],
    }
    config_path = tmp_path / "orch.json"
    config_path.write_text(json.dumps(config))
    app = create_app(config_path=str(config_path))
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=18080,
                                           log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    base = "http://127.0.0.1:18080"
    for _ in range(100):
        try:
            httpx.get(base + "/workflows", timeout=1.0)
            break
        except httpx.ConnectError:
            time.sleep(0.05)
    worker = Worker(base, worker_id="w-e2e",
                    bundles=config["bundles"], poll_interval=0.01)
    client = httpx.Client(base_url=base, timeout=10.0)
    yield worker, client, bundle_dir
    server.should_exit = True
    thread.join(timeout=10)


def test_two_task_linear_workflow_end_to_end(stack):
    worker, client, bundle_dir = stack
    (spec,) = parse_file(bundle_dir / "etl.py", workflow_id="sample_etl")

    assert worker.register()["verdict"] == "accepted"

    response = client.post("/workflows", json={
        "id": spec["id"], "language": spec["language"],
        "bundle": "local-dev", "dag": spec})
    assert response.status_code == 201, response.text

    response = client.post("/runs", json={"workflow_id": "sample_etl", "inputs": {}})
    assert response.status_code == 201, response.text
    run_id = response.json()["id"]

    for _ in range(50):
        worker.run_once()
        detail = client.get(f"/runs/{run_id}").json()
        if detail["status"] in ("succeeded", "failed"):
            break
    assert detail["status"] == "succeeded", detail

    by_name = {t["name"]: t for t in detail["tasks"]}
    assert by_name["extract"]["status"] == "succeeded"
    assert by_name["load"]["status"] == "succeeded"
    assert by_name["extract"]["output"]["type"] == "inline"
    assert by_name["extract"]["output"]["value"] == {"date": "2026-10-16", "rows": 100}
    assert by_name["load"]["output"]["type"] == "blob"

    blob_key = by_name["load"]["output"]["blob"]["key"]
    fetched = client.get(f"/blobs/{blob_key}")
    assert fetched.status_code == 200

    tasks = {t["name"]: t["id"] for t in detail["tasks"]}
    logs = client.get(f"/runs/{run_id}/tasks/{tasks['extract']}/logs")
    assert logs.status_code == 200


BRANCH_WF = '''
from nozzle import task, workflow


@task
def check():
    return True


@task
def fast(flag):
    return "fast"


@task
def slow(flag):
    return "slow"


@task
def join(a, b=None):
    return [a, b]


@workflow(id="branch_e2e", bundle="local-dev")
def branch_e2e():
    flag = check()
    a = fast(flag, run_if=flag.equals(True))
    b = slow(flag, run_if=flag.not_equals(True))
    join(a, b)
'''

BIG_WF = '''
from nozzle import task, workflow


@task
def make():
    return "x" * 70000


@task
def consume(blob):
    return len(blob)


@workflow(id="big_e2e", bundle="local-dev")
def big_e2e():
    consume(make())
'''


def _register_and_run(client, bundle_dir, filename, source, workflow_id):
    (bundle_dir / filename).write_text(source)
    from nozzle.bundles import parse_file

    (spec,) = parse_file(bundle_dir / filename, workflow_id=workflow_id)
    response = client.post("/workflows", json={
        "id": spec["id"], "language": spec["language"],
        "bundle": "local-dev", "dag": spec})
    assert response.status_code == 201, response.text
    response = client.post("/runs", json={"workflow_id": workflow_id, "inputs": {}})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _drive_to_terminal(worker, client, run_id, limit=100):
    detail = None
    for _ in range(limit):
        worker.run_once()
        detail = client.get(f"/runs/{run_id}").json()
        if detail["status"] in ("succeeded", "failed"):
            return detail
    raise AssertionError(f"run {run_id} did not finish: {detail['status']}")


def test_predicate_branch_skips_untaken_path(stack):
    worker, client, bundle_dir = stack
    assert worker.register()["verdict"] == "accepted"
    run_id = _register_and_run(client, bundle_dir, "branch.py", BRANCH_WF, "branch_e2e")
    detail = _drive_to_terminal(worker, client, run_id)
    assert detail["status"] == "succeeded", detail
    by_name = {t["name"]: t for t in detail["tasks"]}
    assert by_name["slow"]["status"] == "skipped"
    assert by_name["fast"]["status"] == "succeeded"
    assert by_name["join"]["status"] == "succeeded"
    assert by_name["join"]["output"]["value"] == ["fast", None]


def test_large_output_travels_by_reference(stack):
    import msgpack

    worker, client, bundle_dir = stack
    assert worker.register()["verdict"] == "accepted"
    run_id = _register_and_run(client, bundle_dir, "big.py", BIG_WF, "big_e2e")
    detail = _drive_to_terminal(worker, client, run_id)
    assert detail["status"] == "succeeded", detail
    by_name = {t["name"]: t for t in detail["tasks"]}
    assert by_name["make"]["output"]["type"] == "blob"
    assert by_name["consume"]["output"]["value"] == 70000
    blob_key = by_name["make"]["output"]["blob"]["key"]
    raw = client.get(f"/blobs/{blob_key}").content
    assert msgpack.unpackb(raw, raw=False) == "x" * 70000
