import { Hono } from "hono";
import { type Env, knobsFromEnv } from "./config";
import { D1Store, LeaseLost, NotFound, resolveBundleVersion, sha256Hex, StoreError, type BundleEntry } from "./store";

const app = new Hono<{ Bindings: Env }>();

function store(c: { env: Env }) {
  if ((c.env.STORE_MODE || "d1") !== "d1") {
    throw new StoreError("hyperdrive mode is not implemented in MVP", 501);
  }
  return new D1Store(c.env.DB, knobsFromEnv(c.env), c.env.STORE);
}

function bundles(c: { env: Env }): BundleEntry[] {
  return knobsFromEnv(c.env).bundles as unknown as BundleEntry[];
}

let migrated: Promise<void> | null = null;
app.use("*", async (c, next) => {
  migrated ??= D1Store.migrate(c.env.DB);
  await migrated;
  await next();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.onError((err: any, c) => {  if (err instanceof LeaseLost) return c.json({ message: err.message || "lease lost" }, 409);
  if (err instanceof NotFound) return c.json({ message: err.message || "not found" }, 404);
  if (err instanceof StoreError) {
    const status = err.status === 403 ? 403 : 400;
    return c.json({ message: err.message }, status);
  }
  throw err;
});

app.get("/workflows", async (c) => c.json(await store(c).listWorkflows()));

app.post("/workflows", async (c) => {
  const body = await c.req.json();
  if (!body.id || !body.language || !body.bundle || !body.dag) {
    throw new StoreError("missing field: id, language, bundle and dag are required");
  }
  c.status(201);
  return c.json(await store(c).registerWorkflow(body.id, body.language, body.bundle, body.dag));
});

app.get("/workflows/:workflow_id", async (c) => c.json(await store(c).getWorkflow(c.req.param("workflow_id"))));

app.get("/workflows/:workflow_id/runs", async (c) =>
  c.json(await store(c).listRuns(c.req.param("workflow_id")))
);

app.post("/runs", async (c) => {
  const body = await c.req.json();
  const s = store(c);
  const workflow = await s.getWorkflow(body.workflow_id);
  const entry = bundles(c).find((b) => b["name"] === workflow["bundle"]);
  if (!entry) throw new StoreError(`bundle not configured: ${workflow["bundle"]}`);
  const version = await resolveBundleVersion(entry);
  c.status(201);
  return c.json(await s.createRun(body.workflow_id, body.inputs ?? {}, version ?? "local"));
});

app.get("/runs/:run_id", async (c) => c.json(await store(c).getRun(c.req.param("run_id"))));

app.post("/workers/register", async (c) => {
  const body = await c.req.json();
  if (!body.language || !body.runtime || !body.core_version) {
    throw new StoreError("missing field: language, runtime and core_version are required");
  }
  return c.json(await store(c).registerWorker(body.worker_id ?? null, body.language, body.runtime, body.core_version, body.provider));
});

app.post("/tasks/claim", async (c) => {
  const body = await c.req.json();
  const assignment = await store(c).claimTask(body.worker_id, body.language, body.runtime, knobsFromEnv(c.env).provider);
  if (!assignment) return c.body(null, 204);
  return c.json({
    ...assignment,
    lease_expires_at: new Date((assignment["lease_expires_at"] as number) * 1000).toISOString(),
  });
});

app.post("/tasks/:task_id/heartbeat", async (c) => {
  const body = await c.req.json();
  const lease = await store(c).heartbeat(c.req.param("task_id"), body.worker_id);
  return c.json({
    ...lease,
    lease_expires_at: new Date((lease["lease_expires_at"] as number) * 1000).toISOString(),
  });
});

app.post("/tasks/:task_id/complete", async (c) => {
  const body = await c.req.json();
  return c.json(await store(c).complete(c.req.param("task_id"), body.worker_id, body.attempt, body.envelope));
});

app.post("/tasks/:task_id/fail", async (c) => {
  const body = await c.req.json();
  return c.json(await store(c).fail(c.req.param("task_id"), body.worker_id, body.attempt, body.error ?? ""));
});

app.post("/tasks/:task_id/blob", async (c) => {
  const body = await c.req.json();
  const knobs = knobsFromEnv(c.env);
  const s = store(c);
  let raw: Uint8Array;
  try {
    const bin = atob(body.content_base64);
    raw = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    throw new StoreError("bad base64");
  }
  if ((await sha256Hex(raw)) !== (body.sha256 ?? "")) throw new StoreError("sha256 mismatch");
  if (raw.length > knobs.maxBlobBytes) throw new StoreError("blob exceeds maximum size");
  const task = await s.getTask(c.req.param("task_id"));
  const stored = await s.storeBlob(task["run_id"] as string, `${c.req.param("task_id")}/${body.attempt ?? 0}/${(body.sha256 as string).slice(0, 12)}`, raw);
  c.status(201);
  return c.json({ backend: "r2", ...stored });
});

app.get("/blobs/*", async (c) => {
  const key = c.req.path.replace(/^\/blobs\//, "");
  if (!key) throw new NotFound("blob key");
  const runId = key.split("/")[0];
  const s = store(c);
  try {
    const raw = await s.fetchBlob(runId, key);
    return new Response(raw, { headers: { "Content-Type": "application/octet-stream" } });
  } catch (e) {
    if (e instanceof NotFound) throw e;
    throw new NotFound(key);
  }
});

app.post("/runs/:run_id/tasks/:task_id/logs", async (c) => {
  const body = await c.req.json();
  const key = `logs/${c.req.param("run_id")}/${c.req.param("task_id")}/${body.attempt ?? 0}.log`;
  if (await c.env.STORE.head(key)) throw new StoreError("log blob already present", 409);
  await c.env.STORE.put(key, body.content ?? "");
  c.status(201);
  return c.json({ ok: true });
});

app.get("/runs/:run_id/tasks/:task_id/logs", async (c) => {
  const attempt = c.req.query("attempt");
  const prefix = `logs/${c.req.param("run_id")}/${c.req.param("task_id")}/`;
  if (attempt !== undefined) {
    const obj = await c.env.STORE.get(`${prefix}${attempt}.log`);
    if (!obj) throw new NotFound("no log blob yet");
    return new Response(await obj.text(), { headers: { "Content-Type": "text/plain" } });
  }
  const listed = await c.env.STORE.list({ prefix });
  if (!listed.objects.length) throw new NotFound("no log blob yet");
  const latest = listed.objects.map((o) => o.key).sort().pop()!;
  const obj = await c.env.STORE.get(latest);
  return new Response(await obj!.text(), { headers: { "Content-Type": "text/plain" } });
});

export default app;
