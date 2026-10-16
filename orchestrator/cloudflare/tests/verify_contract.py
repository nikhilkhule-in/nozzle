"""Behavioral contract verification for orchestrator/cloudflare.

Runs against any live base URL (miniflare local or deployed) with a
configured git bundle name. Mirrors the Python Store conformance scenarios
through HTTP, since the TypeScript D1 store is a separate implementation
that must satisfy the same contract.

Usage:
  NOZZLE_API_BASE=http://127.0.0.1:18880 NOZZLE_TEST_BUNDLE=git-dev \
    uv run --no-project --with httpx python orchestrator/cloudflare/tests/verify_contract.py
Requires a FRESH database (old runs interfere with claim ordering).
"""

import json
import os
import time
import urllib.request

BASE = os.environ["NOZZLE_API_BASE"].rstrip("/")
BUNDLE = os.environ.get("NOZZLE_TEST_BUNDLE", "git-dev")


def call(method, path, body=None):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode() if body is not None else None,
        method=method, headers={"Content-Type": "application/json",
                                "User-Agent": "nozzle-client/0.1 (+contract-verification)"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, raw


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, extra)
    if not cond:
        raise SystemExit(f"contract violation: {name} {extra}")


DIAMOND = {
    "tasks": [{"name": n, "runtime": "cf-container"} for n in ("t0", "t_yes", "t_no", "join")],
    "edges": [
        {"upstream": "t0", "downstream": "t_yes", "arg": "x",
         "predicate": {"op": "equals", "value": True}},
        {"upstream": "t0", "downstream": "t_no", "arg": "x",
         "predicate": {"op": "equals", "value": False}},
        {"upstream": "t_yes", "downstream": "join", "arg": "a"},
        {"upstream": "t_no", "downstream": "join", "arg": "b"},
    ],
}
W = {"worker_id": "w-cf", "language": "python", "runtime": "cf-container"}


def main():
    s, reg = call("POST", "/workers/register",
                  {**W, "core_version": "0.1.0", "provider": "cloudflare"})
    check("register accepted", s == 200 and reg["verdict"] == "accepted", reg)

    s, bad = call("POST", "/workers/register",
                  {**W, "worker_id": "w-old", "core_version": "0.0.0"})
    check("core mismatch rejected", bad["verdict"] == "rejected", bad)

    s, _ = call("POST", "/workflows",
                {"id": "cf-diamond", "language": "python", "bundle": BUNDLE, "dag": DIAMOND})
    check("register workflow", s in (200, 201), s)
    s, run = call("POST", "/runs", {"workflow_id": "cf-diamond", "inputs": {}})
    check("create run pins version", s == 201 and run["bundle_version"] == "abc123def456", run)
    run_id = run["id"]

    s, first = call("POST", "/tasks/claim", {**W})
    check("claim returns t0", s == 200 and first["task_name"] == "t0", first)
    check("assignment carries bundle+code",
          first["bundle"] == BUNDLE and first["bundle_version"] == "abc123def456", first)
    tid, attempt = first["task_id"], first["attempt"]

    s, _ = call("POST", f"/tasks/{tid}/heartbeat", {"worker_id": "w-cf"})
    check("heartbeat renews", s == 200, s)

    inline_true = {"type": "inline", "codec": "json", "size": 4,
                   "sha256": "0" * 64, "value": True}
    s, _ = call("POST", f"/tasks/{tid}/complete",
                {"worker_id": "w-cf", "attempt": attempt, "envelope": inline_true})
    check("complete t0", s == 200, s)
    s, _ = call("POST", f"/tasks/{tid}/complete",
                {"worker_id": "w-cf", "attempt": attempt, "envelope": inline_true})
    check("duplicate complete idempotent", s == 200, s)

    s, second = call("POST", "/tasks/claim", {**W})
    check("claim returns t_yes with inputs", s == 200 and second["task_name"] == "t_yes"
          and second["inputs"]["x"]["value"] is True, second)
    detail = call("GET", f"/runs/{run_id}")[1]
    states = {t["name"]: t["status"] for t in detail["tasks"]}
    check("t_no skipped", states.get("t_no") == "skipped", states)
    s, _ = call("POST", f"/tasks/{second['task_id']}/complete",
                {"worker_id": "w-cf", "attempt": second["attempt"], "envelope": inline_true})
    check("complete t_yes", s == 200, s)
    s, third = call("POST", "/tasks/claim", {**W})
    check("join ready with taken inputs only",
          s == 200 and third["task_name"] == "join" and set(third["inputs"]) == {"a"}, third)

    big = {"type": "inline", "codec": "json", "size": 70000,
           "sha256": "1" * 64, "value": "x"}
    s, verdict = call("POST", f"/tasks/{third['task_id']}/fail",
                      {"worker_id": "w-cf", "attempt": third["attempt"], "error": "boom"})
    check("fail retries", s == 200 and verdict["retry"] is True, verdict)
    s, reclaim = call("POST", "/tasks/claim", {**W})
    check("retry reclaimed with bumped attempt",
          s == 200 and reclaim["attempt"] == third["attempt"] + 1, reclaim)
    s, over = call("POST", f"/tasks/{reclaim['task_id']}/complete",
                   {"worker_id": "w-cf", "attempt": reclaim["attempt"], "envelope": big})
    check("inline overflow rejected", s == 400, over)

    s, foreign = call("POST", "/tasks/claim",
                      {"worker_id": "w-cf", "language": "python", "runtime": "other-runtime"})
    check("no work for unknown runtime", s == 204, s)

    s, other = call("POST", "/workers/register",
                    {"worker_id": "w-other", "language": "python",
                     "runtime": "cf-container", "core_version": "0.1.0",
                     "provider": "elsewhere"})
    check("foreign provider registers", s == 200 and other["verdict"] == "accepted", other)
    s, denied = call("POST", "/tasks/claim",
                     {"worker_id": "w-other", "language": "python", "runtime": "cf-container"})
    check("cross-provider claim rejected", s == 403, denied)

    local_bundle = os.environ.get("LOCAL_REJECT_BUNDLE")
    if local_bundle:
        s, _ = call("POST", "/workflows",
                    {"id": "local-reject", "language": "python",
                     "bundle": local_bundle, "dag": DIAMOND})
        check("local-bundle workflow registers", s in (200, 201), s)
        s, run = call("POST", "/runs", {"workflow_id": "local-reject", "inputs": {}})
        check("local bundle rejected for remote pools", s == 400, run)

    print("ALL CONTRACT CHECKS PASSED")


if __name__ == "__main__":
    main()
