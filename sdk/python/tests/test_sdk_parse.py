"""Task 4.1 verification: parse-time DAG construction (adapted form of the
legacy simple-workflow test, plus parse-rule coverage)."""

import json

import pytest

from nozzle.sdk import OutputRef, task, workflow


@task
def simple_task():
    return "Task completed"


@task(store="blob-only", runtime="cf-container")
def heavy_task(rows):
    return rows


@workflow(id="simple_workflow", bundle="local-dev")
def simple_workflow():
    simple_task()


@workflow(id="linked_workflow", bundle="local-dev")
def linked_workflow():
    rows = simple_task()
    heavy_task(rows)


def test_simple_workflow_parses_to_one_spec():
    assert simple_workflow["id"] == "simple_workflow"
    assert simple_workflow["language"] == "python"
    assert simple_workflow["tasks"] == [
        {"name": "simple_task", "runtime": "local-process"}
    ]
    assert simple_workflow["edges"] == []
    assert simple_workflow["code"]["simple_task"].endswith(":simple_task")


def test_refs_create_edges_and_carry_policy():
    edge = linked_workflow["edges"]
    assert edge == [
        {"upstream": "simple_task", "downstream": "heavy_task", "arg": "rows"}
    ]
    assert linked_workflow["policies"]["heavy_task"] == "blob-only"
    assert linked_workflow["tasks"][1]["runtime"] == "cf-container"


def test_task_call_returns_future_not_value():
    seen = {}

    @workflow(id="probe", bundle="local-dev")
    def probe():
        seen["ref"] = simple_task()

    assert isinstance(seen["ref"], OutputRef)
    assert seen["ref"].task == "simple_task"


def test_task_outside_workflow_fails():
    with pytest.raises(RuntimeError, match="outside workflow"):
        simple_task()


def test_nested_task_definition_rejected():
    with pytest.raises(ValueError, match="module level"):
        @workflow(id="bad", bundle="local-dev")
        def bad():
            @task
            def inner():
                return 1

            inner()


def test_double_call_rejected():
    with pytest.raises(ValueError, match="at most once"):
        @workflow(id="bad2", bundle="local-dev")
        def bad2():
            simple_task()
            simple_task()


def test_non_json_literal_rejected():
    with pytest.raises(ValueError, match="JSON-serializable"):
        @workflow(id="bad3", bundle="local-dev")
        def bad3():
            heavy_task(object())


def test_spec_validates_against_schema():
    import jsonschema
    from pathlib import Path

    root = Path(__file__).parent.parent.parent.parent
    schema = json.load(open(root / "shared/schemas/dag.json"))
    jsonschema.validate(
        {k: linked_workflow[k] for k in ("id", "language", "tasks", "edges")},
        schema,
    )
