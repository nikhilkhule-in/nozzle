"""Task 4.4 verification: bundle files parse to schema-valid specs."""

import json
from pathlib import Path

import jsonschema
import pytest

from nozzle.bundles import parse_file

SAMPLE = Path(__file__).parent / "sample_bundle" / "etl.py"
SCHEMA = json.load(open(Path(__file__).parent.parent.parent.parent / "shared" / "schemas" / "dag.json"))


def core_shape(spec):
    return {k: spec[k] for k in ("id", "language", "tasks", "edges")}


def test_sample_project_parses_to_schema_valid_output():
    (spec,) = parse_file(SAMPLE, workflow_id="sample_etl")
    jsonschema.validate(core_shape(spec), SCHEMA)
    assert spec["id"] == "sample_etl"
    assert [t["name"] for t in spec["tasks"]] == ["extract", "load"]
    assert spec["edges"] == [
        {"upstream": "extract", "downstream": "load", "arg": "snapshot"}
    ]
    assert spec["policies"]["load"] == "blob-only"
    assert spec["code"]["extract"].endswith(":extract")


def test_missing_file_rejected():
    with pytest.raises(ValueError, match="not found"):
        parse_file(SAMPLE.parent / "nope.py")


def test_unknown_workflow_id_rejected():
    with pytest.raises(ValueError, match="not defined"):
        parse_file(SAMPLE, workflow_id="ghost")


def test_repeated_parses_collect_each_import():
    first = parse_file(SAMPLE, workflow_id="sample_etl")
    second = parse_file(SAMPLE, workflow_id="sample_etl")
    assert first[0]["id"] == second[0]["id"] == "sample_etl"
