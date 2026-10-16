"""FastAPI app implementing shared/api/openapi.json on the SQLite store."""

import base64
import binascii
import hashlib
import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from nozzle_orch import bundles as bundle_mod
from nozzle_orch import config as config_mod
from nozzle_orch.store import SQLiteStore
from shared.errors import LeaseLost, NotFound, StoreError


class SPAStatic(StaticFiles):
    """Serve the console shell for any /app/* path without a file."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except (StarletteHTTPException, FileNotFoundError, RuntimeError):
            return FileResponse(os.path.join(str(self.directory), "_shell.html"))


def _iso(epoch):
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


def create_app(config_path=None, store=None):
    knobs = config_mod.load(config_path)
    owned = store if store is not None else SQLiteStore(
        path=knobs.db_path, provider=knobs.provider,
        lease_secs=knobs.lease_secs, max_attempts=knobs.max_attempts,
        inline_threshold=knobs.inline_threshold, blob_dir=knobs.blob_dir)
    bundle_cfg = {b["name"]: b for b in (knobs.bundles or [])}
    os.makedirs(knobs.log_dir, exist_ok=True)

    app = FastAPI(title="Nozzle Orchestrator (local)")
    app.state.store = owned
    app.state.knobs = knobs

    if knobs.ui_dist:
        app.mount("/app", SPAStatic(directory=os.path.join(knobs.ui_dist, "app")),
                  name="console")

    def _err(e):
        if isinstance(e, LeaseLost):
            raise HTTPException(status_code=409, detail=str(e) or "lease lost")
        if isinstance(e, NotFound):
            raise HTTPException(status_code=404, detail=str(e) or "not found")
        raise HTTPException(status_code=400, detail=str(e))

    @app.get("/workflows")
    def list_workflows():
        return owned.list_workflows()

    @app.post("/workflows", status_code=201)
    def register_workflow(body: dict):
        try:
            return owned.register_workflow(
                body["id"], body["language"], body["bundle"], body["dag"])
        except (KeyError, StoreError) as e:
            _err(e if isinstance(e, StoreError) else StoreError(f"missing field: {e}"))

    @app.get("/workflows/{workflow_id}")
    def get_workflow(workflow_id: str):
        try:
            return owned.get_workflow(workflow_id)
        except StoreError as e:
            _err(e)

    @app.get("/workflows/{workflow_id}/runs")
    def list_runs_of_workflow(workflow_id: str):
        try:
            return owned.list_runs(workflow_id)
        except StoreError as e:
            _err(e)

    @app.post("/runs", status_code=201)
    def create_run(body: dict):
        try:
            workflow = owned.get_workflow(body["workflow_id"])
        except StoreError as e:
            _err(e)
        bundle_name = workflow["bundle"]
        if bundle_name not in bundle_cfg:
            raise HTTPException(
                status_code=400, detail=f"bundle not configured: {bundle_name}")
        try:
            version = bundle_mod.resolve_version(bundle_cfg[bundle_name])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        try:
            return owned.create_run(body["workflow_id"], body.get("inputs", {}),
                                    version if version is not None else "local")
        except StoreError as e:
            _err(e)

    @app.get("/runs/{run_id}")
    def get_run(run_id: str):
        try:
            return owned.get_run(run_id)
        except StoreError as e:
            _err(e)

    @app.post("/workers/register")
    def register_worker(body: dict):
        try:
            return owned.register_worker(
                body.get("worker_id"), body["language"], body["runtime"],
                body["core_version"], provider=body.get("provider"))
        except (KeyError, StoreError) as e:
            _err(e if isinstance(e, StoreError) else StoreError(f"missing field: {e}"))

    @app.post("/tasks/claim", status_code=200)
    def claim_task(body: dict):
        try:
            assignment = owned.claim_task(
                body["worker_id"], body["language"], body["runtime"])
        except StoreError as e:
            if "unpaired" in str(e):
                raise HTTPException(status_code=403, detail=str(e))
            _err(e)
        if assignment is None:
            return Response(status_code=204)
        assignment["lease_expires_at"] = _iso(assignment["lease_expires_at"])
        return assignment

    @app.post("/tasks/{task_id}/heartbeat")
    def heartbeat(task_id: str, body: dict):
        try:
            lease = owned.heartbeat(task_id, body["worker_id"])
        except StoreError as e:
            _err(e)
        lease["lease_expires_at"] = _iso(lease["lease_expires_at"])
        return lease

    @app.post("/tasks/{task_id}/complete")
    def complete(task_id: str, body: dict):
        try:
            return owned.complete(task_id, body["worker_id"], body["attempt"],
                                  body["envelope"])
        except StoreError as e:
            _err(e)

    @app.post("/tasks/{task_id}/fail")
    def fail(task_id: str, body: dict):
        try:
            return owned.fail(task_id, body["worker_id"], body["attempt"],
                              body.get("error", ""))
        except StoreError as e:
            _err(e)

    @app.post("/tasks/{task_id}/blob", status_code=201)
    def upload_blob(task_id: str, body: dict):
        try:
            raw = base64.b64decode(body["content_base64"])
        except (KeyError, binascii.Error) as e:
            raise HTTPException(status_code=400, detail=f"bad base64: {e}")
        if hashlib.sha256(raw).hexdigest() != body.get("sha256", ""):
            raise HTTPException(status_code=400, detail="sha256 mismatch")
        if len(raw) > knobs.max_blob_bytes:
            raise HTTPException(status_code=400, detail="blob exceeds maximum size")
        try:
            task = owned.get_task(task_id)
            stored = owned.store_blob(
                task["run_id"], f"{task_id}/{body.get('attempt', 0)}/{body['sha256'][:12]}", raw)
        except StoreError as e:
            _err(e)
        return {"backend": "local-fs", "key": stored["key"],
                "size": stored["size"], "sha256": stored["sha256"]}

    @app.get("/blobs/{key:path}")
    def fetch_blob(key: str):
        run_id = key.split("/")[0]
        try:
            raw = owned.fetch_blob(run_id, key)
        except StoreError as e:
            _err(e)
        return Response(content=raw, media_type="application/octet-stream")

    @app.post("/runs/{run_id}/tasks/{task_id}/logs", status_code=201)
    def write_logs(run_id: str, task_id: str, body: dict):
        path = os.path.join(knobs.log_dir, run_id, task_id, f"{body.get('attempt', 0)}.log")
        if os.path.exists(path):
            raise HTTPException(status_code=409, detail="log blob already present")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(body.get("content", ""))
        return {"ok": True}

    @app.get("/runs/{run_id}/tasks/{task_id}/logs", response_class=PlainTextResponse)
    def read_logs(run_id: str, task_id: str, attempt: int = -1):
        directory = os.path.join(knobs.log_dir, run_id, task_id)
        if not os.path.isdir(directory):
            raise HTTPException(status_code=404, detail="no log blob yet")
        if attempt < 0:
            candidates = sorted(os.listdir(directory))
            if not candidates:
                raise HTTPException(status_code=404, detail="no log blob yet")
            path = os.path.join(directory, candidates[-1])
        else:
            path = os.path.join(directory, f"{attempt}.log")
            if not os.path.isfile(path):
                raise HTTPException(status_code=404, detail="no log blob yet")
        with open(path) as f:
            return PlainTextResponse(f.read())

    return app
