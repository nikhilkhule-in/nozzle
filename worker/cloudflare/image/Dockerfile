FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Staged by prepare.sh: prebuilt nozzle wheel, worker package, bundle code.
COPY dist/ /tmp/dist/
COPY nozzle_worker/ /app/nozzle_worker/
COPY bundle/ /bundle/
COPY entrypoint.sh /app/entrypoint.sh
COPY worker.json /etc/nozzle/worker.json
RUN pip install --no-cache-dir /tmp/dist/nozzle-*.whl httpx \
    && rm -rf /tmp/dist \
    && chmod +x /app/entrypoint.sh

ENV PYTHONPATH=/app \
    ORCH_URL="" \
    BUNDLES_FILE=/etc/nozzle/worker.json \
    WORKER_ID="" \
    PROVIDER=cloudflare \
    RUNTIME=cf-container \
    POLL_INTERVAL=2

ENTRYPOINT ["/app/entrypoint.sh"]
