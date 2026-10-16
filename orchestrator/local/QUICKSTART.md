# Local quickstart

End-to-end run of the reference stack on one machine: SQLite orchestrator +
polling worker + sample bundle. Every command below was verified in order;
times are illustrative (`Q` is a scratch dir, here `/tmp/nozzle-q`).

Prerequisites: Rust toolchain, `uv`, Python 3.12 (see repo root).

## 1. Sync environments

```bash
uv sync --project orchestrator/local --group dev
uv sync --project worker/local --group dev
```

After changing anything under `sdk/python`, refresh the SDK snapshot in
both venvs (path dependencies are not rebuilt automatically):

```bash
uv sync --project orchestrator/local --reinstall-package nozzle
uv sync --project worker/local --reinstall-package nozzle
```

## 2. Lay out a bundle and configs

```bash
Q=/tmp/nozzle-q
mkdir -p $Q/bundle
cp sdk/python/tests/sample_bundle/etl.py $Q/bundle/etl.py
cat > $Q/orch.json <<'EOF'
{
  "db_path": ":memory:",
  "blob_dir": "/tmp/nozzle-q/blobs",
  "log_dir": "/tmp/nozzle-q/logs",
  "bundles": [{"name": "local-dev", "type": "local", "path": "/tmp/nozzle-q/bundle"}]
}
EOF
cp $Q/orch.json $Q/worker.json
```

## 3. Start the orchestrator

```bash
cd orchestrator/local
PYTHONPATH=.:../.. .venv/bin/python -m nozzle_orch --config /tmp/nozzle-q/orch.json --port 8000
```

## 4. Register the workflow and trigger a run

In another shell (repo root). The DAG comes from the SDK parser so the
registered shape is exactly what workers execute:

```bash
sdk/python/.venv/bin/python -c "
import json
from nozzle.bundles import parse_file
(spec,) = parse_file('/tmp/nozzle-q/bundle/etl.py', workflow_id='sample_etl')
print(json.dumps({'id': spec['id'], 'language': spec['language'], 'bundle': 'local-dev', 'dag': spec}))
" > /tmp/nozzle-q/register.json
curl -s -X POST localhost:8000/workflows -H 'Content-Type: application/json' \
  -d @/tmp/nozzle-q/register.json
curl -s -X POST localhost:8000/runs -H 'Content-Type: application/json' \
  -d '{"workflow_id": "sample_etl", "inputs": {}}'
```

## 5. Run the worker until idle

```bash
cd worker/local
PYTHONPATH=.:../.. .venv/bin/python -m nozzle_worker --orch-url http://127.0.0.1:8000 \
  --bundles /tmp/nozzle-q/worker.json --until-idle 5
```

Expected: registration `accepted`, then the worker claims `extract` and
`load` (`load` uploads a blob because its policy is `blob-only`) and exits
after 5 idle polls.

## 6. Confirm the run succeeded

```bash
curl -s localhost:8000/runs/R-1 | python3 -m json.tool
curl -s localhost:8000/runs/R-1/tasks/T-1/logs
```

Expected: run `status` is `succeeded`, both tasks `succeeded`, `load`'s
output is a `blob` envelope, and the log endpoint returns text.
