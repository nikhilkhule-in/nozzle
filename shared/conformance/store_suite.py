"""Store behavior contract shared by every provider implementation.

`make_suite_runner` adapts these checks to any Store: providers pass their
own factory (e.g. SQLite, D1) and get the same guarantees verified. The
`FakeStore` below is the reference behavior, not a product surface; its
readiness rules mirror `core/src/readiness.rs`.
"""

CORE_VERSION = "0.1.0"


import pytest


class StoreError(Exception):
    pass


class LeaseLost(StoreError):
    pass


class NotFound(StoreError):
    pass


def _predicate_matches(output, predicate):
    if predicate is None:
        return True
    op, expected = predicate["op"], predicate["value"]
    equal = output == expected
    return equal if op == "equals" else not equal


class FakeStore:
    """In-memory reference Store with an injectable clock."""

    def __init__(self, provider="local", lease_secs=60, max_attempts=3, clock=None):
        self.provider = provider
        self.lease_secs = lease_secs
        self.max_attempts = max_attempts
        self._now = clock if clock is not None else [0.0]
        self.workflows = {}
        self.runs = {}
        self.tasks = {}
        self.workers = {}
        self._run_seq = 0
        self._task_seq = 0

    def now(self):
        return self._now[0]

    def advance(self, secs):
        self._now[0] += secs

    # -- workflows / runs -------------------------------------------------
    def register_workflow(self, workflow_id, language, bundle, dag):
        self.workflows[workflow_id] = {
            "id": workflow_id, "language": language,
            "bundle": bundle, "dag": dag,
        }
        return self.workflows[workflow_id]

    def create_run(self, workflow_id, inputs, bundle_version):
        if workflow_id not in self.workflows:
            raise NotFound(workflow_id)
        self._run_seq += 1
        run_id = f"R-{self._run_seq}"
        dag = self.workflows[workflow_id]["dag"]
        task_ids = {}
        for spec in dag["tasks"]:
            self._task_seq += 1
            task_id = f"T-{self._task_seq}"
            task_ids[spec["name"]] = task_id
            self.tasks[task_id] = {
                "id": task_id, "run_id": run_id, "name": spec["name"],
                "status": "queued", "attempt": 0, "lease_owner": None,
                "lease_expires_at": None, "error": None, "output": None,
            }
        run = {"id": run_id, "workflow_id": workflow_id, "status": "queued",
               "bundle_version": bundle_version, "tasks": list(task_ids.values())}
        self.runs[run_id] = run
        if run["tasks"]:
            run["status"] = "running"
        return run

    def get_run(self, run_id):
        run = self.runs[run_id]
        return {**run, "tasks": [self.tasks[t] for t in run["tasks"]]}

    # -- workers ----------------------------------------------------------
    def register_worker(self, worker_id, language, runtime, core_version, provider=None):
        if core_version != CORE_VERSION:
            return {"worker_id": worker_id, "verdict": "rejected",
                    "reason": "core version mismatch"}
        self.workers[worker_id] = {
            "worker_id": worker_id, "language": language,
            "runtime": runtime, "provider": provider or self.provider,
        }
        return {"worker_id": worker_id, "verdict": "accepted"}

    # -- readiness --------------------------------------------------------
    def _incoming(self, run_id, name):
        dag = self.workflows[self.runs[run_id]["workflow_id"]]["dag"]
        return [e for e in dag["edges"] if e["downstream"] == name]

    def _by_name(self, run_id):
        return {self.tasks[t]["name"]: self.tasks[t] for t in self.runs[run_id]["tasks"]}

    def _readiness(self, run_id, name):
        by_name = self._by_name(run_id)
        incoming = self._incoming(run_id, name)
        if not incoming:
            return "ready"
        satisfied = False
        for edge in incoming:
            up = by_name[edge["upstream"]]
            if up["status"] == "succeeded":
                output = (up["output"] or {}).get("value")
                if _predicate_matches(output, edge.get("predicate")):
                    satisfied = True
            elif up["status"] == "skipped":
                continue
            elif up["status"] == "failed":
                return "blocked"
            else:
                return "waiting"
        return "ready" if satisfied else "should_skip"

    def _settle(self, run_id):
        changed = True
        while changed:
            changed = False
            for task_id in self.runs[run_id]["tasks"]:
                task = self.tasks[task_id]
                if task["status"] == "queued" and \
                        self._readiness(run_id, task["name"]) == "should_skip":
                    task["status"] = "skipped"
                    changed = True

    def _reap_expired(self, run_id):
        for task_id in self.runs[run_id]["tasks"]:
            task = self.tasks[task_id]
            if task["status"] == "running" and task["lease_expires_at"] is not None \
                    and task["lease_expires_at"] <= self.now():
                task["status"] = "queued"
                task["lease_owner"] = None
                task["lease_expires_at"] = None

    # -- claim / heartbeat / complete / fail -------------------------------
    def claim_task(self, worker_id, language, runtime):
        worker = self.workers.get(worker_id)
        if worker is None:
            raise NotFound(worker_id)
        if worker["provider"] != self.provider:
            raise StoreError("unpaired provider network")
        for run in self.runs.values():
            if self.workflows[run["workflow_id"]]["language"] != language:
                continue
            self._reap_expired(run["id"])
            for task_id in run["tasks"]:
                task = self.tasks[task_id]
                if task["status"] != "queued":
                    continue
                if self._readiness(run["id"], task["name"]) != "ready":
                    continue
                task["status"] = "running"
                task["attempt"] += 1
                task["lease_owner"] = worker_id
                task["lease_expires_at"] = self.now() + self.lease_secs
                return {
                    "run_id": run["id"], "task_id": task_id,
                    "task_name": task["name"], "attempt": task["attempt"],
                    "inputs": self._inputs(run["id"], task["name"]),
                    "bundle_version": run["bundle_version"],
                    "lease_expires_at": task["lease_expires_at"],
                }
        return None

    def _inputs(self, run_id, name):
        by_name = self._by_name(run_id)
        inputs = {}
        for edge in self._incoming(run_id, name):
            up = by_name[edge["upstream"]]
            if up["status"] == "succeeded" and _predicate_matches(
                    (up["output"] or {}).get("value"), edge.get("predicate")):
                inputs[edge["arg"]] = up["output"]
        return inputs

    def _owned(self, task_id, worker_id):
        task = self.tasks[task_id]
        if task["lease_owner"] != worker_id:
            raise LeaseLost(task_id)
        if task["lease_expires_at"] is not None and task["lease_expires_at"] <= self.now():
            raise LeaseLost(task_id)
        return task

    def heartbeat(self, task_id, worker_id):
        task = self._owned(task_id, worker_id)
        task["lease_expires_at"] = self.now() + self.lease_secs
        return {"task_id": task_id, "lease_owner": worker_id,
                "lease_expires_at": task["lease_expires_at"]}

    def complete(self, task_id, worker_id, attempt, envelope):
        task = self.tasks[task_id]
        if task["status"] in ("succeeded", "failed", "skipped"):
            return {"ok": True}
        task = self._owned(task_id, worker_id)
        if attempt != task["attempt"]:
            raise StoreError("stale attempt")
        task["status"] = "succeeded"
        task["output"] = envelope
        task["lease_owner"] = None
        task["lease_expires_at"] = None
        self._settle(task["run_id"])
        return {"ok": True}

    def fail(self, task_id, worker_id, attempt, error):
        task = self._owned(task_id, worker_id)
        if attempt != task["attempt"]:
            raise StoreError("stale attempt")
        task["error"] = error
        if attempt >= self.max_attempts:
            task["status"] = "failed"
            task["lease_owner"] = None
            return {"retry": False}
        task["status"] = "queued"
        task["lease_owner"] = None
        task["lease_expires_at"] = None
        return {"retry": True, "next_attempt": attempt + 1}


DIAMOND_DAG = {
    "tasks": [{"name": n, "runtime": "local-process"}
              for n in ("t0", "t_yes", "t_no", "join")],
    "edges": [
        {"upstream": "t0", "downstream": "t_yes", "arg": "x",
         "predicate": {"op": "equals", "value": True}},
        {"upstream": "t0", "downstream": "t_no", "arg": "x",
         "predicate": {"op": "equals", "value": False}},
        {"upstream": "t_yes", "downstream": "join", "arg": "a"},
        {"upstream": "t_no", "downstream": "join", "arg": "b"},
    ],
}

CHAIN_DAG = {
    "tasks": [{"name": n, "runtime": "local-process"} for n in ("t0", "t1")],
    "edges": [{"upstream": "t0", "downstream": "t1", "arg": "x"}],
}

INLINE = {"type": "inline", "codec": "json", "size": 4,
          "sha256": "0" * 64, "value": True}


def _fresh(factory=None, **kwargs):
    store = (factory or FakeStore)(**kwargs)
    store.register_workflow("wf", "python", "local-dev", CHAIN_DAG)
    store.register_worker("w1", "python", "local-process", CORE_VERSION)
    return store


def test_atomic_claim_single_winner(make_store):
    store = make_store()
    store.register_workflow("wf", "python", "local-dev", CHAIN_DAG)
    store.register_worker("w1", "python", "local-process", CORE_VERSION)
    store.register_worker("w2", "python", "local-process", CORE_VERSION)
    run = store.create_run("wf", {}, "v1")
    first = store.claim_task("w1", "python", "local-process")
    assert first["task_name"] == "t0"
    assert store.claim_task("w2", "python", "local-process") is None
    assert store.get_run(run["id"])["status"] == "running"


def test_claim_none_when_nothing_ready(make_store):
    store = _fresh(make_store)
    store.create_run("wf", {}, "v1")
    assert store.claim_task("w1", "python", "local-process")["task_name"] == "t0"
    assert store.claim_task("w1", "python", "local-process") is None


def test_chain_readiness(make_store):
    store = _fresh(make_store)
    run = store.create_run("wf", {}, "v1")
    claimed = store.claim_task("w1", "python", "local-process")
    assert claimed["task_name"] == "t0"
    store.complete(claimed["task_id"], "w1", claimed["attempt"], INLINE)
    second = store.claim_task("w1", "python", "local-process")
    assert second["task_name"] == "t1"
    assert second["inputs"]["x"]["value"] is True


def test_lease_expiry_releases_task(make_store):
    store = _fresh(make_store, lease_secs=60)
    store.create_run("wf", {}, "v1")
    store.register_worker("w2", "python", "local-process", CORE_VERSION)
    first = store.claim_task("w1", "python", "local-process")
    store.advance(61)
    second = store.claim_task("w2", "python", "local-process")
    assert second["task_id"] == first["task_id"]
    assert second["attempt"] == first["attempt"] + 1


def test_heartbeat_extends_lease(make_store):
    store = _fresh(make_store, lease_secs=60)
    store.create_run("wf", {}, "v1")
    claimed = store.claim_task("w1", "python", "local-process")
    store.advance(50)
    lease = store.heartbeat(claimed["task_id"], "w1")
    assert lease["lease_expires_at"] == 110
    store.advance(59)
    with pytest.raises(LeaseLost):
        store.heartbeat(claimed["task_id"], "w2")


def test_idempotent_complete(make_store):
    store = _fresh(make_store)
    store.create_run("wf", {}, "v1")
    claimed = store.claim_task("w1", "python", "local-process")
    args = (claimed["task_id"], "w1", claimed["attempt"], INLINE)
    assert store.complete(*args) == {"ok": True}
    assert store.complete(*args) == {"ok": True}
    assert store.get_run("R-1")["tasks"][0]["output"]["value"] is True


def test_foreign_complete_rejected(make_store):
    store = _fresh(make_store)
    store.create_run("wf", {}, "v1")
    store.register_worker("w2", "python", "local-process", CORE_VERSION)
    claimed = store.claim_task("w1", "python", "local-process")
    with pytest.raises(LeaseLost):
        store.complete(claimed["task_id"], "w2", claimed["attempt"], INLINE)


def test_fail_retries_then_terminal(make_store):
    store = _fresh(make_store, max_attempts=2)
    store.create_run("wf", {}, "v1")
    claimed = store.claim_task("w1", "python", "local-process")
    assert store.fail(claimed["task_id"], "w1", claimed["attempt"], "boom") == {
        "retry": True, "next_attempt": 2}
    again = store.claim_task("w1", "python", "local-process")
    assert again["attempt"] == 2
    assert store.fail(again["task_id"], "w1", again["attempt"], "boom") == {"retry": False}
    assert store.claim_task("w1", "python", "local-process") is None


def test_predicate_skip_and_join(make_store):
    store = make_store()
    store.register_workflow("wf", "python", "local-dev", DIAMOND_DAG)
    store.register_worker("w1", "python", "local-process", CORE_VERSION)
    run = store.create_run("wf", {}, "v1")
    t0 = store.claim_task("w1", "python", "local-process")
    assert t0["task_name"] == "t0"
    store.complete(t0["task_id"], "w1", t0["attempt"], INLINE)
    yes = store.claim_task("w1", "python", "local-process")
    assert yes["task_name"] == "t_yes"
    assert yes["inputs"]["x"]["value"] is True
    detail = store.get_run(run["id"])
    assert detail["tasks"][2]["status"] == "skipped"
    store.complete(yes["task_id"], "w1", yes["attempt"], INLINE)
    join = store.claim_task("w1", "python", "local-process")
    assert join["task_name"] == "join"
    assert set(join["inputs"]) == {"a"}


def test_all_skipped_join_skips(make_store):
    store = make_store()
    store.register_workflow("wf", "python", "local-dev", {
        "tasks": [{"name": n, "runtime": "local-process"}
                  for n in ("t0", "a", "b", "join")],
        "edges": [
            {"upstream": "t0", "downstream": "a", "arg": "x",
             "predicate": {"op": "equals", "value": 1}},
            {"upstream": "t0", "downstream": "b", "arg": "x",
             "predicate": {"op": "equals", "value": 2}},
            {"upstream": "a", "downstream": "join", "arg": "a"},
            {"upstream": "b", "downstream": "join", "arg": "b"},
        ],
    })
    store.register_worker("w1", "python", "local-process", CORE_VERSION)
    store.create_run("wf", {}, "v1")
    t0 = store.claim_task("w1", "python", "local-process")
    assert t0["task_name"] == "t0"
    zero = dict(INLINE, value=0)
    store.complete(t0["task_id"], "w1", t0["attempt"], zero)
    assert store.claim_task("w1", "python", "local-process") is None
    names = {t["name"]: t["status"] for t in store.get_run("R-1")["tasks"]}
    assert names == {"t0": "succeeded", "a": "skipped", "b": "skipped",
                     "join": "skipped"}


def test_worker_core_mismatch_rejected(make_store):
    store = make_store()
    verdict = store.register_worker("w-old", "python", "local-process", "0.0.0")
    assert verdict["verdict"] == "rejected"


def test_unpaired_provider_rejected(make_store):
    store = make_store(provider="local")
    store.register_workflow("wf", "python", "local-dev", CHAIN_DAG)
    store.register_worker("w-cf", "python", "cf-container", CORE_VERSION,
                           provider="cloudflare")
    store.create_run("wf", {}, "v1")
    with pytest.raises(StoreError, match="unpaired"):
        store.claim_task("w-cf", "python", "cf-container")
