"""Task 3.2 verification: sample payloads validate against the schemas."""

import json
from pathlib import Path

import jsonschema
import pytest

SCHEMAS = Path(__file__).parent.parent


def load(name):
    with open(SCHEMAS / name) as f:
        return json.load(f)


VALID_DAG = {
    "id": "w",
    "language": "python",
    "tasks": [
        {"name": "t0", "runtime": "local-process"},
        {"name": "t_yes", "runtime": "local-process"},
    ],
    "edges": [
        {"upstream": "t0", "downstream": "t_yes", "arg": "x",
         "predicate": {"op": "equals", "value": True}},
    ],
}

VALID_INLINE = {
    "type": "inline", "codec": "msgpack", "size": 12,
    "sha256": "9f2c" + "0" * 60, "value": {"n": 1},
}

VALID_BLOB = {
    "type": "inline", "codec": "msgpack", "size": 12,
    "sha256": "a" * 64, "value": 1,
}

VALID_BLOB_REF = {
    "type": "blob", "codec": "msgpack", "size": 3_100_000,
    "sha256": "b" * 64,
    "blob": {"backend": "r2", "key": "runs/R/blob", "size": 3_100_000, "sha256": "b" * 64},
}


def test_valid_dag_accepted():
    jsonschema.validate(VALID_DAG, load("dag.json"))


@pytest.mark.parametrize("dag", [
    {"language": "python", "tasks": [], "edges": []},
    {"id": "w", "language": "python", "tasks": [{"name": "t0"}], "edges": []},
    {"id": "w", "language": "python", "tasks": [{"name": "t0", "runtime": "x"}],
     "edges": [{"upstream": "t0", "downstream": "t1", "arg": "x",
                "predicate": {"op": "equals", "value": {"nested": True}}}]},
    {"id": "w", "language": "python", "tasks": [{"name": "t0", "runtime": "x"}],
     "edges": [{"upstream": "t0", "downstream": "t1", "arg": "x",
                "predicate": {"op": "contains", "value": "x"}}]},
])
def test_invalid_dags_rejected(dag):
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(dag, load("dag.json"))


def test_valid_envelopes_accepted():
    schema = load("envelope.json")
    jsonschema.validate(VALID_INLINE, schema)
    jsonschema.validate(VALID_BLOB, schema)
    jsonschema.validate(VALID_BLOB_REF, schema)


@pytest.mark.parametrize("envelope", [
    {"type": "inline", "codec": "msgpack", "size": 1, "sha256": "c" * 64},
    {"type": "blob", "codec": "msgpack", "size": 1, "sha256": "c" * 64},
    {"type": "inline", "codec": "msgpack", "size": 1, "sha256": "xyz",
     "value": 1},
    {"type": "blob", "codec": "msgpack", "size": 1, "sha256": "c" * 64,
     "blob": {"backend": "r2", "key": "k", "size": 1, "sha256": "short"}},
    {"type": "inline", "codec": "msgpack", "size": 1, "sha256": "c" * 64,
     "value": 1, "blob": {"backend": "r2", "key": "k", "size": 1, "sha256": "c" * 64}},
])
def test_invalid_envelopes_rejected(envelope):
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(envelope, load("envelope.json"))
