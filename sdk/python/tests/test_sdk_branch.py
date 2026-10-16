"""Task 4.2 verification: declarative branching (adapted form of the legacy
conditional-workflow test)."""

import json

import pytest

from nozzle.core import next_ready, task_readiness
from nozzle.sdk import OutputRef, task, workflow

RAN = []


@task
def check():
    RAN.append("check")
    return True


@task
def task_true(flag):
    RAN.append("task_true")
    return "It is True"


@task
def task_false(flag):
    RAN.append("task_false")
    return "It is False"


@workflow(id="conditional_workflow", bundle="local-dev")
def conditional_workflow():
    flag = check()
    task_true(flag, run_if=flag.equals(True))
    task_false(flag, run_if=flag.not_equals(True))


def _edges():
    return json.dumps(conditional_workflow["edges"])


def _tasks(output):
    return json.dumps([
        {"name": "check", "status": "succeeded", "output": output},
        {"name": "task_true", "status": "queued"},
        {"name": "task_false", "status": "queued"},
    ])


def test_predicates_recorded_on_edges():
    edges = {e["downstream"]: e for e in conditional_workflow["edges"]}
    assert edges["task_true"]["predicate"] == {"op": "equals", "value": True}
    assert edges["task_false"]["predicate"] == {"op": "not_equals", "value": True}
    assert edges["task_true"]["arg"] == "flag"


def test_parse_executes_nothing():
    assert RAN == [], "task bodies must not run during parsing"


def test_true_output_readies_true_branch_only():
    assert json.loads(next_ready(_tasks(True), _edges())) == ["task_true"]
    assert task_readiness("task_false", _tasks(True), _edges()) == "should_skip"


def test_false_output_readies_false_branch_only():
    assert json.loads(next_ready(_tasks(False), _edges())) == ["task_false"]
    assert task_readiness("task_true", _tasks(False), _edges()) == "should_skip"


def test_truth_testing_a_future_fails_with_guidance():
    with pytest.raises(ValueError, match="cannot truth-test"):

        @workflow(id="probe", bundle="local-dev")
        def probe():
            flag = check()
            if flag:
                task_true(flag)
