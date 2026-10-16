#!/bin/sh
# Container entrypoint: env in, worker out. BUNDLES_JSON overrides the baked file.
set -eu
if [ -n "${BUNDLES_JSON:-}" ]; then
  echo "$BUNDLES_JSON" > /etc/nozzle/worker.json
fi
ARGS="--orch-url $ORCH_URL --bundles ${BUNDLES_FILE} --poll-interval ${POLL_INTERVAL}"
if [ -n "${WORKER_ID:-}" ]; then ARGS="$ARGS --worker-id $WORKER_ID"; fi
ARGS="$ARGS --provider ${PROVIDER} --runtime ${RUNTIME}"
exec python -m nozzle_worker $ARGS
