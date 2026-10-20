"""Task 2.2 verification: Python calls scheduling logic in Rust."""

import json

import pytest

from nozzle import (
    assert_compat,
    classify_output,
    content_hash,
    core_version,
    defaults,
    next_ready,
    task_readiness,
    validate_workflow,
)

DAG = {
    "id": "w",
    "language": "python",
    "tasks": [
        {"name": "t0", "runtime": "local-process"},
        {"name": "t_yes", "runtime": "local-process"},
        {"name": "t_no", "runtime": "local-process"},
        {"name": "join", "runtime": "local-process"},
    ],
    "edges": [
        {"upstream": "t0", "downstream": "t_yes", "arg": "x",
         "predicate": {"op": "equals", "value": True}},
        {"upstream": "t0", "downstream": "t_no", "arg": "x",
         "predicate": {"op": "equals", "value": False}},
        {"upstream": "t_yes", "downstream": "join", "arg": "a"},
        {"upstream": "t_no", "downstream": "join", "arg": "b"},
    ],
}


def test_validate_runs_in_rust():
    validate_workflow(json.dumps(DAG))
    bad = dict(DAG, tasks=DAG["tasks"] + [{"name": "t0", "runtime": "x"}])
    with pytest.raises(ValueError, match="duplicate"):
        validate_workflow(json.dumps(bad))


def test_next_ready_and_readiness_from_rust():
    tasks = [
        {"name": "t0", "status": "succeeded", "output": True},
        {"name": "t_yes", "status": "queued"},
        {"name": "t_no", "status": "queued"},
        {"name": "join", "status": "queued"},
    ]
    edges = json.dumps(DAG["edges"])
    assert json.loads(next_ready(json.dumps(tasks), edges)) == ["t_yes"]
    assert task_readiness("t_no", json.dumps(tasks), edges) == "should_skip"
    assert task_readiness("join", json.dumps(tasks), edges) == "waiting"


def test_classify_and_hash_from_rust():
    assert classify_output(10, "auto", 64) == "inline"
    assert classify_output(64, "auto", 64) == "blob"
    with pytest.raises(ValueError, match="exceeds"):
        classify_output(64, "inline-only", 64)
    assert content_hash(b"nozzle") == content_hash(b"nozzle")
    assert len(json.loads(defaults())) == 6


def test_lockstep_version_assertion():
    assert_compat(core_version())
    with pytest.raises(ValueError, match="lockstep"):
        assert_compat("0.0.0")
