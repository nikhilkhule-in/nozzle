# Cloudflare deployment (MVP)

## Resources (created 2026-10-16, account `nikhilkhule`)

- D1 `nozzle-mvp` (`1852b1d7-2689-4606-833e-e3a55b6b1212`), bound as `DB`
- R2 `nozzle-mvp-store`, bound as `STORE`
- Worker `nozzle-mvp-orchestrator` → `https://nozzle-mvp-orchestrator.nikhilkhule.workers.dev`
- Worker `nozzle-worker-manager` → container fleet manager (needs image build; see below)

## Orchestrator config

`wrangler.toml` binds D1 + R2. Runtime knobs are `[vars]` (`PROVIDER`,
`STORE_MODE=d1`, lease/attempt/threshold limits). `BUNDLES` is a JSON list
of `{name, type, ...}`; git bundles resolve versions via explicit `version`
or the GitHub API, `local` bundles are rejected for remote pools.

Deploy:

```bash
wrangler deploy --var 'BUNDLES:[{"name":"git-dev","type":"git","url":"https://github.com/example/workflows.git","version":"abc123def456"}]'
```

## Verification (fresh DB required)

Old runs interfere with claim ordering, so every verification run starts
clean: delete local `.wrangler/state` for miniflare, or empty the tables on
deployed D1 before running:

```bash
# local miniflare
wrangler dev --local --port 18880 --var 'BUNDLES:[...]'
NOZZLE_API_BASE=http://127.0.0.1:18880 NOZZLE_TEST_BUNDLE=git-dev \
  uv run pytest shared/api/tests/test_client_smoke.py -q
NOZZLE_API_BASE=http://127.0.0.1:18880 NOZZLE_TEST_BUNDLE=git-dev \
  LOCAL_REJECT_BUNDLE=local-test \
  uv run --no-project --with httpx python orchestrator/cloudflare/tests/verify_contract.py
```

Both suites passed against miniflare D1+R2 and against the deployed worker
(2026-10-16): generated-client smoke 2/2 plus 19 behavioral checks
(register/compat, version pinning, claim order, heartbeat, idempotent
complete, skip propagation, join inputs, retry bump, overflow rejection,
unpaired-provider 403, local-bundle 400).

Verified results: `nozzle-mvp-orchestrator` serves the full 15-operation
contract on real D1+R2; a local-process worker drove run `R-3` (`cf-xnet`)
to `succeeded` across the edge with the blob path exercised.

## Edge notes

- API clients must send an identifying `User-Agent`: the edge answers 1010
  to bare `Python-urllib/*` signatures. The shared verification clients send
  `nozzle-client/0.1`. Browser/curl UAs pass.
- No in-app auth in MVP; put Cloudflare Access in front of the worker URL.

## Worker containers (image build prerequisite)

`worker/cloudflare/image/prepare.sh` stages the wheel, worker package, and
bundle code; `worker/cloudflare/manager` deploys the fleet manager
(`[[containers]]` + `getByName(name).start({envVars})`).

Building and pushing the image requires a local Docker-compatible CLI
(`wrangler deploy` builds during deploy; `wrangler containers build/push`
otherwise). No container runtime exists in the reference dev environment,
so image build/push and container-boot verification are outstanding: deploy
the manager once Docker is available, start an instance with
`ORCH_URL` + `BUNDLES_JSON` env, trigger a run, confirm `succeeded`, then
stop the instance (idle containers bill).
