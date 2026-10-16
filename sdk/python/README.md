# Nozzle Python SDK

Workflows-as-code over the Rust core (`core/`). Parsing builds a validated
DAG; workers execute tasks later from the pinned bundle. Nothing here
executes task bodies — importing a workflow file only records specs.

```python
from nozzle import task, workflow


@task
def extract(date):
    return {"date": date, "rows": 100}


@workflow(id="etl", bundle="local-dev")
def etl():
    extract("2026-10-16")


assert etl["tasks"] == [{"name": "extract", "runtime": "local-process"}]
```

Build the extension and install into a venv:

```bash
uv venv --python 3.12 .venv
VIRTUAL_ENV="$PWD/.venv" PATH="$PWD/.venv/bin:$PATH" uvx maturin develop
.venv/bin/pytest tests/
```

## Tasks and futures

Calling a `@task` function during parsing records a node and returns an
`OutputRef` future. Passing futures into another task records edges:

```python
from nozzle import task, workflow


@task
def extract(date):
    return {"date": date}


@task
def load(snapshot):
    return snapshot


@workflow(id="linked", bundle="local-dev")
def linked():
    snapshot = extract("2026-10-16")
    load(snapshot)


assert linked["edges"] == [
    {"upstream": "extract", "downstream": "load", "arg": "snapshot"}
]
```

Rules: task functions must live at module level (workers import them as
`module:qualname`, recorded per task under spec key `code`); each task may
be called at most once per workflow; arguments must be futures or
JSON-serializable literals; calling a task outside a `@workflow` body
raises `RuntimeError`.

## Branching with predicates

Never truth-test a future — the value does not exist until a worker runs the
task. Declare branches with `ref.equals(value)` / `ref.not_equals(value)` as
`run_if=` on the downstream task:

```python
from nozzle import task, workflow


@task
def check():
    return True


@task
def on_true(flag):
    return "yes"


@task
def on_false(flag):
    return "no"


@workflow(id="branched", bundle="local-dev")
def branched():
    flag = check()
    on_true(flag, run_if=flag.equals(True))
    on_false(flag, run_if=flag.not_equals(True))


edges = {e["downstream"]: e["predicate"] for e in branched["edges"]}
assert edges["on_true"] == {"op": "equals", "value": True}
assert edges["on_false"] == {"op": "not_equals", "value": True}
```

Raw conditionals fail fast with guidance:

```python
from nozzle import task, workflow


@task
def check():
    return True


@task
def go(flag):
    return flag


try:
    @workflow(id="bad", bundle="local-dev")
    def bad():
        if check():
            go(check())
except ValueError as e:
    assert "cannot truth-test" in str(e)
else:
    raise AssertionError("parse should have failed")
```

`run_if` is reserved: task functions may not declare such a parameter, and
the referenced task must be an argument of the same call. Predicates accept
JSON scalars only.

## Placement hints

Control where outputs land when they materialize:

```python
from nozzle import task, workflow


@task(store="blob-only")
def heavy(rows):
    return rows


@workflow(id="placed", bundle="local-dev")
def placed():
    heavy([1, 2, 3])


assert placed["policies"] == {"heavy": "blob-only"}
```

Policies: `auto` (system splits by size), `inline-only` (overflow fails the
attempt), `blob-only` (always a blob reference). Workers read the policy
for the task they execute; the orchestrator enforces it at completion.

## Codecs

Task values encode with `json` (readable) or `msgpack` (compact, bytes stay
bytes). Custom objects are rejected loudly — convert with `to_dict()` at
the task boundary:

```python
from nozzle.codecs import decode, encode

payload, codec = encode({"rows": [1, 2]}, "msgpack")
assert decode(payload, codec) == {"rows": [1, 2]}
payload, _ = encode(b"\x00raw", "msgpack")
assert decode(payload, "msgpack") == b"\x00raw"
```

## Bundles

`parse_file` imports a workflow file in isolation and returns the specs it
defines (validating each through the Rust core):

```python
import tempfile
from pathlib import Path

from nozzle.bundles import parse_file

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "wf.py"
    path.write_text(
        "from nozzle import task, workflow\n"
        "\n\n@task\ndef a():\n    return 1\n"
        "\n\n@task\ndef b(x):\n    return x\n"
        "\n\n@workflow(id=\"mini\", bundle=\"local-dev\")\ndef mini():\n    b(a())\n"
    )
    (spec,) = parse_file(path, workflow_id="mini")

assert [t["name"] for t in spec["tasks"]] == ["a", "b"]
assert spec["code"]["a"].endswith(":a")
```
