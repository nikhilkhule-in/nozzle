#!/bin/sh
# Stage build inputs into worker/cloudflare/image/. Run from the repo root.
# Generated copies are git-ignored; this script reproduces them.
set -eu
ROOT=$(git rev-parse --show-toplevel)
IMG="$ROOT/worker/cloudflare/image"
rm -rf "$IMG/dist" "$IMG/nozzle_worker" "$IMG/bundle"
mkdir -p "$IMG/dist" "$IMG/bundle"
cp "$ROOT"/sdk/python/dist/nozzle-*.whl "$IMG/dist/"
cp -r "$ROOT"/worker/local/nozzle_worker "$IMG/nozzle_worker"
find "$IMG" -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
cp "$ROOT"/sdk/python/tests/sample_bundle/etl.py "$IMG/bundle/etl.py"
ls "$IMG/dist" "$IMG/bundle"
