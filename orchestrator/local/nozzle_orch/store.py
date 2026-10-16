"""SQLite reference Store. Same behavior as the conformance FakeStore, durable.

Every scheduling decision delegates to the Rust core through the `nozzle`
SDK bindings: workflow validation, claim readiness, skip settling,
predicate-matched input building, output classification, and version
compat. This module owns only SQL, locking, and clock handling.
"""

import hashlib
import json
import sqlite3
import threading
import time

from shared.errors import LeaseLost, NotFound, StoreError

SCHEMA = """
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER);
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY, language TEXT NOT NULL, bundle TEXT NOT NULL,
    dag_json TEXT NOT NULL, policies_json TEXT NOT NULL DEFAULT '{}',
    code_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, status TEXT NOT NULL,
    bundle_version TEXT, inputs_json TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL, started_at REAL, finished_at REAL);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, name TEXT NOT NULL,
    runtime TEXT NOT NULL, policy TEXT NOT NULL DEFAULT 'auto',
    code_ref TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0, lease_owner TEXT,
    lease_expires_at REAL, error TEXT, output_json TEXT);
CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY, language TEXT NOT NULL, runtime TEXT NOT NULL,
    provider TEXT NOT NULL, core_version TEXT NOT NULL, last_seen REAL);
"""


class SQLiteStore:
    def __init__(self, path=":memory:", *, provider="local", lease_secs=60,
                 max_attempts=3, inline_threshold=65536, blob_dir="blobs",
                 now_fn=None):
        from nozzle import assert_compat as _assert  # noqa: F401  (warms import)

        self.provider = provider
        self.lease_secs = lease_secs
        self.max_attempts = max_attempts
        self.inline_threshold = inline_threshold
        self.blob_dir = blob_dir
        self._now_fn = now_fn or time.time
        self._lock = threading.RLock()
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        with self._lock, self._db:
            self._db.executescript(SCHEMA)

    # -- plumbing -------------------------------------------------------
    def now(self):
        return self._now_fn()

    def _next_id(self, kind, prefix):
        with self._lock:
            row = self._db.execute(
                "SELECT value FROM counters WHERE name = ?", (kind,)).fetchone()
            value = (row["value"] if row else 0) + 1
            self._db.execute(
                "INSERT INTO counters(name, value) VALUES(?, ?) "
                "ON CONFLICT(name) DO UPDATE SET value = excluded.value",
                (kind, value))
            self._db.commit()
        return f"{prefix}-{value}"

    def _dag(self, workflow_id):
        row = self._db.execute(
            "SELECT dag_json, language FROM workflows WHERE id = ?",
            (workflow_id,)).fetchone()
        if row is None:
            raise NotFound(workflow_id)
        return json.loads(row["dag_json"]), row["language"]

    def _task_rows(self, run_id):
        return self._db.execute(
            "SELECT * FROM tasks WHERE run_id = ? ORDER BY rowid", (run_id,)).fetchall()

    def _views_json(self, run_id):
        views = []
        for row in self._task_rows(run_id):
            view = {"name": row["name"], "status": row["status"]}
            if row["status"] == "succeeded" and row["output_json"]:
                envelope = json.loads(row["output_json"])
                view["output"] = self._materialize(run_id, envelope)
            views.append(view)
        return json.dumps(views)

    def _edges_json(self, run_id, workflow_id):
        dag, _ = self._dag(workflow_id)
        core_edges = []
        for edge in dag["edges"]:
            core_edge = {"upstream": edge["upstream"],
                         "downstream": edge["downstream"], "arg": edge["arg"]}
            if edge.get("predicate"):
                core_edge["predicate"] = edge["predicate"]
            core_edges.append(core_edge)
        return json.dumps(core_edges)

    def _materialize(self, run_id, envelope):
        if envelope["type"] == "inline":
            return envelope.get("value")
        from nozzle.codecs import decode

        blob = envelope["blob"]
        raw = self.fetch_blob(run_id, blob["key"])
        return decode(raw, envelope["codec"])

    # -- workflows / runs -----------------------------------------------
    def register_workflow(self, workflow_id, language, bundle, dag):
        from nozzle import validate_workflow

        core_edges = []
        for edge in dag["edges"]:
            core_edge = {"upstream": edge["upstream"],
                         "downstream": edge["downstream"], "arg": edge["arg"]}
            if edge.get("predicate"):
                core_edge["predicate"] = edge["predicate"]
            core_edges.append(core_edge)
        core_shape = {"id": workflow_id, "language": language,
                      "tasks": dag["tasks"], "edges": core_edges}
        try:
            validate_workflow(json.dumps(core_shape))
        except ValueError as e:
            raise StoreError(str(e))
        with self._lock, self._db:
            self._db.execute(
                "INSERT OR REPLACE INTO workflows(id, language, bundle, dag_json,"
                " policies_json, code_json) VALUES(?, ?, ?, ?, ?, ?)",
                (workflow_id, language, bundle, json.dumps(dag),
                 json.dumps(dag.get("policies", {})), json.dumps(dag.get("code", {}))))
            self._db.commit()
        return {"id": workflow_id, "language": language, "bundle": bundle, "dag": dag}

    def create_run(self, workflow_id, inputs, bundle_version):
        dag, _ = self._dag(workflow_id)
        run_id = self._next_id("run", "R")
        policies = dag.get("policies", {})
        codes = dag.get("code", {})
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO runs(id, workflow_id, status, bundle_version,"
                " inputs_json, created_at) VALUES(?, ?, ?, ?, ?, ?)",
                (run_id, workflow_id, "running" if dag["tasks"] else "succeeded",
                 bundle_version, json.dumps(inputs), self.now()))
            for spec in dag["tasks"]:
                self._db.execute(
                    "INSERT INTO tasks(id, run_id, name, runtime, policy, code_ref,"
                    " status) VALUES(?, ?, ?, ?, ?, ?, 'queued')",
                    (self._next_id("task", "T"), run_id, spec["name"],
                     spec.get("runtime", "local-process"),
                     policies.get(spec["name"], "auto"),
                     codes.get(spec["name"], "")))
            self._db.commit()
        return self.get_run(run_id)

    def get_run(self, run_id):
        row = self._db.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            raise NotFound(run_id)
        run = dict(row)
        run["tasks"] = [self._row_to_task(r) for r in self._task_rows(run_id)]
        return run

    def list_workflows(self):
        return [{"id": r["id"], "language": r["language"], "bundle": r["bundle"],
                 "dag": json.loads(r["dag_json"])}
                for r in self._db.execute("SELECT * FROM workflows ORDER BY id")]

    def get_workflow(self, workflow_id):
        row = self._db.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
        if row is None:
            raise NotFound(workflow_id)
        return {"id": row["id"], "language": row["language"],
                "bundle": row["bundle"], "dag": json.loads(row["dag_json"])}

    def list_runs(self, workflow_id):
        self.get_workflow(workflow_id)
        return [{k: r[k] for k in
                 ("id", "workflow_id", "status", "bundle_version", "created_at",
                  "started_at", "finished_at")}
                for r in self._db.execute(
                    "SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at",
                    (workflow_id,))]

    def get_task(self, task_id):
        row = self._db.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise NotFound(task_id)
        return self._row_to_task(row)

    @staticmethod
    def _row_to_task(row):
        task = {"id": row["id"], "run_id": row["run_id"], "name": row["name"],
                "status": row["status"], "attempt": row["attempt"],
                "lease_owner": row["lease_owner"],
                "lease_expires_at": row["lease_expires_at"],
                "error": row["error"],
                "output": json.loads(row["output_json"]) if row["output_json"] else None}
        return task

    # -- workers ----------------------------------------------------------
    def register_worker(self, worker_id, language, runtime, core_version,
                        provider=None):
        from nozzle import assert_compat

        try:
            assert_compat(core_version)
        except ValueError as e:
            return {"worker_id": worker_id, "verdict": "rejected", "reason": str(e)}
        worker_id = worker_id or f"w-{hashlib.sha256(str(self.now()).encode()).hexdigest()[:8]}"
        with self._lock, self._db:
            self._db.execute(
                "INSERT OR REPLACE INTO workers(id, language, runtime, provider,"
                " core_version, last_seen) VALUES(?, ?, ?, ?, ?, ?)",
                (worker_id, language, runtime, provider or self.provider,
                 core_version, self.now()))
            self._db.commit()
        return {"worker_id": worker_id, "verdict": "accepted"}

    # -- readiness ----------------------------------------------------------
    def _reap_expired(self, run_id):
        with self._lock, self._db:
            rows = self._db.execute(
                "SELECT id FROM tasks WHERE run_id = ? AND status = 'running'"
                " AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?",
                (run_id, self.now())).fetchall()
            for row in rows:
                self._db.execute(
                    "UPDATE tasks SET status = 'queued', lease_owner = NULL,"
                    " lease_expires_at = NULL WHERE id = ?", (row["id"],))
            self._db.commit()

    def _settle(self, run_id, workflow_id):
        from nozzle import task_readiness

        changed = True
        while changed:
            changed = False
            views = self._views_json(run_id)
            edges = self._edges_json(run_id, workflow_id)
            for row in self._task_rows(run_id):
                if row["status"] == "queued" and task_readiness(
                        row["name"], views, edges) == "should_skip":
                    with self._lock, self._db:
                        self._db.execute(
                            "UPDATE tasks SET status = 'skipped' WHERE id = ?",
                            (row["id"],))
                        self._db.commit()
                    changed = True

    def _rollup(self, run_id):
        with self._lock, self._db:
            statuses = [r["status"] for r in self._task_rows(run_id)]
            if not statuses or all(s in ("succeeded", "skipped") for s in statuses):
                status, finished = "succeeded", self.now()
            elif "failed" in statuses and not any(
                    s in ("queued", "running") for s in statuses):
                status, finished = "failed", self.now()
            else:
                status, finished = "running", None
            self._db.execute(
                "UPDATE runs SET status = ?, finished_at = COALESCE(?, finished_at),"
                " started_at = COALESCE(started_at, ?) WHERE id = ?",
                (status, finished, self.now(), run_id))
            self._db.commit()

    # -- claim / heartbeat / complete / fail ----------------------------------
    def claim_task(self, worker_id, language, runtime):
        from nozzle import next_ready

        worker = self._db.execute(
            "SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone()
        if worker is None:
            raise NotFound(worker_id)
        if worker["provider"] != self.provider:
            raise StoreError("unpaired provider network")
        with self._lock:
            runs = self._db.execute(
                "SELECT * FROM runs ORDER BY created_at").fetchall()
        for run in runs:
            dag, wf_language = self._dag(run["workflow_id"])
            if wf_language != language:
                continue
            self._reap_expired(run["id"])
            ready = set(json.loads(next_ready(
                self._views_json(run["id"]),
                self._edges_json(run["id"], run["workflow_id"]))))
            with self._lock:
                for row in self._task_rows(run["id"]):
                    if row["status"] != "queued" or row["name"] not in ready:
                        continue
                    if row["runtime"] != runtime:
                        continue
                    attempt = row["attempt"] + 1
                    lease_expires_at = self.now() + self._lease_secs()
                    self._db.execute(
                        "UPDATE tasks SET status = 'running', attempt = ?,"
                        " lease_owner = ?, lease_expires_at = ? WHERE id = ?",
                        (attempt, worker_id, lease_expires_at, row["id"]))
                    self._db.commit()
                    task = self._row_to_task(self._db.execute(
                        "SELECT * FROM tasks WHERE id = ?", (row["id"],)).fetchone())
                    return {
                        "run_id": run["id"], "task_id": task["id"],
                        "task_name": task["name"], "attempt": attempt,
                        "inputs": self._inputs(run["id"], task["name"]),
                        "bundle": self._workflow_bundle(run["workflow_id"]),
                        "bundle_version": run["bundle_version"],
                        "code_ref": self._code_ref(run["workflow_id"], task["name"]),
                        "source": dag.get("source", {}),
                        "lease_expires_at": lease_expires_at,
                    }
        return None

    def _lease_secs(self):
        return self.lease_secs

    def _workflow_bundle(self, workflow_id):
        row = self._db.execute(
            "SELECT bundle FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
        return row["bundle"]

    def _code_ref(self, workflow_id, task_name):
        row = self._db.execute(
            "SELECT code_json FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
        return json.loads(row["code_json"]).get(task_name, "")

    def _inputs(self, run_id, name):
        from nozzle import evaluate_predicate

        run = self._db.execute(
            "SELECT workflow_id FROM runs WHERE id = ?", (run_id,)).fetchone()
        dag, _ = self._dag(run["workflow_id"])
        by_name = {r["name"]: r for r in self._task_rows(run_id)}
        inputs = {}
        for param, literal in dag.get("params", {}).get(name, {}).items():
            raw = json.dumps(literal).encode()
            inputs[param] = {
                "type": "inline", "codec": "json", "size": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(), "value": literal,
            }
        for edge in dag["edges"]:
            if edge["downstream"] != name:
                continue
            up = by_name[edge["upstream"]]
            if up["status"] != "succeeded" or not up["output_json"]:
                continue
            envelope = json.loads(up["output_json"])
            value = self._materialize(run_id, envelope)
            if edge.get("predicate") and not evaluate_predicate(
                    json.dumps(value), json.dumps(edge["predicate"])):
                continue
            inputs[edge["arg"]] = envelope
        return inputs

    def _owned(self, task_id, worker_id):
        row = self._db.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise NotFound(task_id)
        if row["lease_owner"] != worker_id:
            raise LeaseLost(task_id)
        if row["lease_expires_at"] is not None and row["lease_expires_at"] <= self.now():
            raise LeaseLost(task_id)
        return row

    def heartbeat(self, task_id, worker_id):
        self._owned(task_id, worker_id)
        lease_expires_at = self.now() + self.lease_secs
        with self._lock, self._db:
            self._db.execute(
                "UPDATE tasks SET lease_expires_at = ? WHERE id = ?",
                (lease_expires_at, task_id))
            self._db.commit()
        return {"task_id": task_id, "lease_owner": worker_id,
                "lease_expires_at": lease_expires_at}

    def complete(self, task_id, worker_id, attempt, envelope):
        from nozzle import classify_output

        row = self._db.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise NotFound(task_id)
        if row["status"] in ("succeeded", "failed", "skipped"):
            return {"ok": True}
        self._owned(task_id, worker_id)
        if attempt != row["attempt"]:
            raise StoreError("stale attempt")
        size = envelope.get("size")
        if size is None and envelope.get("type") == "inline":
            size = len(json.dumps(envelope.get("value")).encode())
        try:
            where = classify_output(size or 0, row["policy"], self.inline_threshold)
        except ValueError as e:
            raise StoreError(f"{e}; upload output first via blob endpoint")
        if envelope["type"] == "inline" and where == "blob":
            raise StoreError(
                f"inline output of {size} bytes meets the {self.inline_threshold} byte"
                " threshold; upload output first via blob endpoint")
        if envelope["type"] == "blob" and row["policy"] == "inline-only":
            raise StoreError("blob output forbidden under inline-only policy")
        with self._lock, self._db:
            self._db.execute(
                "UPDATE tasks SET status = 'succeeded', output_json = ?,"
                " lease_owner = NULL, lease_expires_at = NULL WHERE id = ?",
                (json.dumps(envelope), task_id))
            self._db.commit()
        run_id = row["run_id"]
        run = self._db.execute(
            "SELECT workflow_id FROM runs WHERE id = ?", (run_id,)).fetchone()
        self._settle(run_id, run["workflow_id"])
        self._rollup(run_id)
        return {"ok": True}

    def fail(self, task_id, worker_id, attempt, error):
        row = self._owned(task_id, worker_id)
        if attempt != row["attempt"]:
            raise StoreError("stale attempt")
        with self._lock, self._db:
            if attempt >= self.max_attempts:
                self._db.execute(
                    "UPDATE tasks SET status = 'failed', error = ?,"
                    " lease_owner = NULL WHERE id = ?", (error, task_id))
                self._db.commit()
                self._rollup(row["run_id"])
                return {"retry": False}
            self._db.execute(
                "UPDATE tasks SET status = 'queued', error = ?,"
                " lease_owner = NULL, lease_expires_at = NULL WHERE id = ?",
                (error, task_id))
            self._db.commit()
        return {"retry": True, "next_attempt": attempt + 1}

    # -- blobs (filesystem-backed for the local implementation) --------------
    def store_blob(self, run_id, key, raw):
        import os

        digest = hashlib.sha256(raw).hexdigest()
        path = os.path.join(self.blob_dir, run_id, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(raw)
        return {"key": f"{run_id}/{key}", "size": len(raw), "sha256": digest}

    def fetch_blob(self, run_id, key):
        import os

        if key.startswith(run_id + "/"):
            rel = key[len(run_id) + 1:]
        else:
            rel = key
        path = os.path.join(self.blob_dir, run_id, rel)
        if not os.path.isfile(path):
            raise NotFound(key)
        with open(path, "rb") as f:
            return f.read()
