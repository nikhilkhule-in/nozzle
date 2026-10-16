"""Local worker: register, poll/claim, heartbeat, execute, report.

Envelope rules (mirror the contract):
- `bytes` results always travel the blob path (`codec: "bytes"`).
- JSON-native results try inline first; on a 400 overflow verdict the worker
  uploads msgpack bytes and completes with the blob reference.
- Inputs arrive as envelopes: inline values used directly, blob references
  fetched via `/blobs/{key}` and decoded with the envelope codec.
"""

import base64
import hashlib
import io
import json
import threading
import time
import traceback
from contextlib import redirect_stderr, redirect_stdout

import httpx


class Worker:
    def __init__(self, orch_url, worker_id=None, language="python",
                 runtime="local-process", provider="local", bundles=None,
                 poll_interval=10, heartbeat_secs=15, transport=None):
        from nozzle import core_version

        self.base = orch_url.rstrip("/")
        self.worker_id = worker_id or f"w-{hashlib.sha256(str(time.time()).encode()).hexdigest()[:8]}"
        self.language = language
        self.runtime = runtime
        self.provider = provider
        self.bundles = {b["name"]: b for b in (bundles or [])}
        self.poll_interval = poll_interval
        self.heartbeat_secs = heartbeat_secs
        self.core_version = core_version()
        self._client = httpx.Client(base_url=self.base, transport=transport,
                                    timeout=30.0)

    # -- HTTP -----------------------------------------------------------
    def _post(self, path, body, path_params=None):
        response = self._client.post(path, json=body)
        if response.status_code == 204:
            return None
        if response.status_code >= 400:
            detail = response.text
            try:
                detail = response.json().get("detail", detail)
            except ValueError:
                pass
            raise WorkerError(f"POST {path} -> {response.status_code}: {detail}")
        return response.json()

    def _get_bytes(self, path):
        response = self._client.get(path)
        if response.status_code >= 400:
            raise WorkerError(f"GET {path} -> {response.status_code}: {response.text}")
        return response.content

    # -- lifecycle --------------------------------------------------------
    def register(self):
        """Ensure bundle setup, then register; asserts the verdict."""
        from nozzle_worker.bundles import materialize

        for bundle in self.bundles.values():
            if bundle["type"] == "local":
                materialize(bundle, None)
        verdict = self._post("/workers/register", {
            "worker_id": self.worker_id, "language": self.language,
            "runtime": self.runtime, "core_version": self.core_version,
            "provider": self.provider})
        if verdict["verdict"] != "accepted":
            raise WorkerError(f"registration {verdict['verdict']}: {verdict.get('reason')}")
        self.worker_id = verdict["worker_id"]
        return verdict

    def run_once(self):
        """Claim and run a single task. Returns True when work was done."""
        try:
            assignment = self._post("/tasks/claim", {
                "worker_id": self.worker_id, "language": self.language,
                "runtime": self.runtime})
        except WorkerError:
            return False
        if assignment is None:
            return False
        self.execute(assignment)
        return True

    def run_forever(self, stop):
        while not stop.is_set():
            try:
                if not self.run_once():
                    stop.wait(self.poll_interval)
            except WorkerError:
                stop.wait(self.poll_interval)

    # -- execution ----------------------------------------------------------
    def execute(self, assignment):
        from nozzle.codecs import decode, encode
        from nozzle_worker.bundles import load_task, materialize

        task_id = assignment["task_id"]
        attempt = assignment["attempt"]
        bundle = self.bundles[assignment["bundle"]]
        bundle_dir = materialize(bundle, assignment["bundle_version"])
        source_file = (assignment.get("source") or {}).get("file")
        if not source_file:
            self._fail(task_id, attempt, "assignment carries no source file")
            return
        try:
            func = load_task(bundle_dir, source_file, assignment["code_ref"])
        except (ValueError, AttributeError, ImportError) as e:
            self._fail(task_id, attempt, f"cannot load task: {e}")
            return
        kwargs = {}
        try:
            for arg, envelope in assignment.get("inputs", {}).items():
                kwargs[arg] = self._resolve(envelope, decode)
        except WorkerError as e:
            self._fail(task_id, attempt, str(e))
            return
        stop = threading.Event()
        heart = threading.Thread(target=self._beat, args=(task_id, stop), daemon=True)
        heart.start()
        output = io.StringIO()
        try:
            with redirect_stdout(output), redirect_stderr(output):
                result = func(**kwargs)
        except Exception:
            output.write(traceback.format_exc())
            stop.set()
            self._fail(task_id, attempt, traceback.format_exc(limit=3))
            self._write_logs(assignment, attempt, output.getvalue())
            return
        finally:
            stop.set()
        self._complete(task_id, attempt, result, encode, output.getvalue())
        self._write_logs(assignment, attempt, output.getvalue())

    def _beat(self, task_id, stop):
        while not stop.wait(self.heartbeat_secs):
            try:
                self._post(f"/tasks/{task_id}/heartbeat", {"worker_id": self.worker_id})
            except WorkerError:
                return

    def _resolve(self, envelope, decode):
        if envelope["type"] == "inline":
            return envelope["value"]
        raw = self._get_bytes(f"/blobs/{envelope['blob']['key']}")
        if hashlib.sha256(raw).hexdigest() != envelope["blob"]["sha256"]:
            raise WorkerError("blob integrity mismatch")
        codec = envelope["codec"]
        if codec == "bytes":
            return raw
        return decode(raw, codec)

    def _complete(self, task_id, attempt, result, encode, logs):
        if isinstance(result, (bytes, bytearray)):
            raw, codec = bytes(result), "bytes"
            ref = self._upload(task_id, attempt, raw)
            envelope = {"type": "blob", "codec": codec, "size": len(raw),
                        "sha256": ref["sha256"], "blob": ref}
            self._post(f"/tasks/{task_id}/complete", {
                "worker_id": self.worker_id, "attempt": attempt, "envelope": envelope})
            return
        try:
            inline_value = json.loads(json.dumps(result))
        except (TypeError, ValueError):
            self._fail(task_id, attempt,
                       f"task returned {type(result).__name__}; return JSON-native "
                       "values or bytes")
            return
        size = len(json.dumps(inline_value).encode())
        envelope = {"type": "inline", "codec": "json", "size": size,
                    "sha256": hashlib.sha256(
                        json.dumps(inline_value).encode()).hexdigest(),
                    "value": inline_value}
        try:
            self._post(f"/tasks/{task_id}/complete", {
                "worker_id": self.worker_id, "attempt": attempt, "envelope": envelope})
        except WorkerError as e:
            if "upload" not in str(e):
                self._fail(task_id, attempt, str(e))
                return
            payload, _ = encode(result, "msgpack")
            ref = self._upload(task_id, attempt, payload)
            envelope = {"type": "blob", "codec": "msgpack", "size": len(payload),
                        "sha256": ref["sha256"], "blob": ref}
            self._post(f"/tasks/{task_id}/complete", {
                "worker_id": self.worker_id, "attempt": attempt, "envelope": envelope})

    def _upload(self, task_id, attempt, raw):
        return self._post(f"/tasks/{task_id}/blob", {
            "worker_id": self.worker_id, "attempt": attempt,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "content_base64": base64.b64encode(raw).decode()})

    def _fail(self, task_id, attempt, error):
        try:
            self._post(f"/tasks/{task_id}/fail", {
                "worker_id": self.worker_id, "attempt": attempt, "error": error})
        except WorkerError:
            pass

    def _write_logs(self, assignment, attempt, content):
        try:
            self._post(
                f"/runs/{assignment['run_id']}/tasks/{assignment['task_id']}/logs",
                {"attempt": attempt,
                 "content": content or f"[{assignment['task_name']}] exit attempt {attempt}"})
        except WorkerError:
            pass


class WorkerError(Exception):
    pass
