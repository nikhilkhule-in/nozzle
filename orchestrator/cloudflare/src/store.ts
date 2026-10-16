import { SCHEMA, type Env, type Knobs } from "./config";
import {
  assert_compat,
  classify_output,
  core_version,
  evaluate_predicate,
  next_ready,
  task_readiness,
  validate_workflow,
} from "./core";

export { core_version };

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export class LeaseLost extends StoreError {
  constructor(id: string) {
    super(id || "lease lost", 409);
  }
}
export class NotFound extends StoreError {
  constructor(id: string) {
    super(id || "not found", 404);
  }
}

export interface BundleEntry {
  name: string;
  type: string;
  url?: string;
  path?: string;
  tracking_ref?: string;
  version?: string;
}

const now = () => Date.now() / 1000;
const iso = (epoch: number) => new Date(epoch * 1000).toISOString();

export class D1Store {
  constructor(private db: D1Database, private knobs: Knobs, private bucket: R2Bucket) {}

  static async migrate(db: D1Database): Promise<void> {
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }

  private async nextId(kind: string, prefix: string): Promise<string> {
    const row = await this.db.prepare("SELECT value FROM counters WHERE name = ?").bind(kind).first<{ value: number }>();
    const value = (row?.value ?? 0) + 1;
    await this.db.prepare(
      "INSERT INTO counters(name, value) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value"
    ).bind(kind, value).run();
    return `${prefix}-${value}`;
  }

  private async dagOf(workflowId: string): Promise<{ dag: Record<string, unknown>; language: string; bundle: string }> {
    const row = await this.db.prepare("SELECT dag_json, language, bundle FROM workflows WHERE id = ?").bind(workflowId).first<{ dag_json: string; language: string; bundle: string }>();
    if (!row) throw new NotFound(workflowId);
    return { dag: JSON.parse(row.dag_json), language: row.language, bundle: row.bundle };
  }

  private async taskRows(runId: string): Promise<Record<string, unknown>[]> {
    const out = await this.db.prepare("SELECT * FROM tasks WHERE run_id = ? ORDER BY rowid").bind(runId).all<Record<string, unknown>>();
    return out.results ?? [];
  }

  private toTask(row: Record<string, unknown>): Record<string, unknown> {
    return {
      id: row["id"], run_id: row["run_id"], name: row["name"], status: row["status"],
      attempt: row["attempt"], lease_owner: row["lease_owner"] ?? null,
      lease_expires_at: row["lease_expires_at"] ?? null, error: row["error"] ?? null,
      output: row["output_json"] ? JSON.parse(row["output_json"] as string) : null,
    };
  }

  // -- workflows / runs -------------------------------------------------
  async registerWorkflow(id: string, language: string, bundle: string, dag: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tasks = dag["tasks"] as Array<Record<string, string>>;
    const edges = (dag["edges"] as Array<Record<string, unknown>>).map((e) => {
      const core: Record<string, unknown> = { upstream: e["upstream"], downstream: e["downstream"], arg: e["arg"] };
      if (e["predicate"]) core["predicate"] = e["predicate"];
      return core;
    });
    try {
      validate_workflow(JSON.stringify({ id, language, tasks, edges }));
    } catch (e) {
      throw new StoreError(String(e));
    }
    const policies = (dag["policies"] as object) ?? {};
    const code = (dag["code"] as object) ?? {};
    await this.db.prepare(
      "INSERT OR REPLACE INTO workflows(id, language, bundle, dag_json, policies_json, code_json) VALUES(?, ?, ?, ?, ?, ?)"
    ).bind(id, language, bundle, JSON.stringify(dag), JSON.stringify(policies), JSON.stringify(code)).run();
    return { id, language, bundle, dag };
  }

  async getWorkflow(id: string): Promise<Record<string, unknown>> {
    const row = await this.db.prepare("SELECT * FROM workflows WHERE id = ?").bind(id).first<Record<string, unknown>>();
    if (!row) throw new NotFound(id);
    return { id: row["id"], language: row["language"], bundle: row["bundle"], dag: JSON.parse(row["dag_json"] as string) };
  }

  async listWorkflows(): Promise<Record<string, unknown>[]> {
    const out = await this.db.prepare("SELECT * FROM workflows ORDER BY id").all<Record<string, unknown>>();
    return (out.results ?? []).map((r) => ({ id: r["id"], language: r["language"], bundle: r["bundle"], dag: JSON.parse(r["dag_json"] as string) }));
  }

  async createRun(workflowId: string, inputs: object, bundleVersion: string): Promise<Record<string, unknown>> {
    const { dag } = await this.dagOf(workflowId);
    const runId = await this.nextId("run", "R");
    const tasks = dag["tasks"] as Array<Record<string, string>>;
    const policies = (dag["policies"] as Record<string, string>) ?? {};
    const code = (dag["code"] as Record<string, string>) ?? {};
    const stmts = [
      this.db.prepare("INSERT INTO runs(id, workflow_id, status, bundle_version, inputs_json, created_at) VALUES(?, ?, ?, ?, ?, ?)")
        .bind(runId, workflowId, tasks.length ? "running" : "succeeded", bundleVersion, JSON.stringify(inputs), now()),
    ];
    for (const spec of tasks) {
      const taskId = await this.nextId("task", "T");
      stmts.push(this.db.prepare(
        "INSERT INTO tasks(id, run_id, name, runtime, policy, code_ref, status) VALUES(?, ?, ?, ?, ?, ?, 'queued')"
      ).bind(taskId, runId, spec["name"], spec["runtime"] ?? "local-process", policies[spec["name"]] ?? "auto", code[spec["name"]] ?? ""));
    }
    await this.db.batch(stmts);
    return this.getRun(runId);
  }

  async getRun(runId: string): Promise<Record<string, unknown>> {    const row = await this.db.prepare("SELECT * FROM runs WHERE id = ?").bind(runId).first<Record<string, unknown>>();
    if (!row) throw new NotFound(runId);
    const tasks = await this.taskRows(runId);
    return { ...row, tasks: tasks.map((t) => this.toTask(t)) };
  }

  async getTask(taskId: string): Promise<Record<string, unknown>> {
    const row = await this.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<Record<string, unknown>>();
    if (!row) throw new NotFound(taskId);
    return this.toTask(row);
  }

  async listRuns(workflowId: string): Promise<Record<string, unknown>[]> {
    await this.getWorkflow(workflowId);
    const out = await this.db.prepare("SELECT id, workflow_id, status, bundle_version, created_at, started_at, finished_at FROM runs WHERE workflow_id = ? ORDER BY created_at").bind(workflowId).all<Record<string, unknown>>();
    return out.results ?? [];
  }

  // -- workers ------------------------------------------------------------
  async registerWorker(workerId: string | null, language: string, runtime: string, coreVersion: string, provider?: string): Promise<Record<string, unknown>> {
    try {
      assert_compat(coreVersion);
    } catch (e) {
      return { worker_id: workerId, verdict: "rejected", reason: String(e) };
    }
    const id = workerId || `w-${Math.random().toString(36).slice(2, 10)}`;
    await this.db.prepare(
      "INSERT OR REPLACE INTO workers(id, language, runtime, provider, core_version, last_seen) VALUES(?, ?, ?, ?, ?, ?)"
    ).bind(id, language, runtime, provider || this.knobs.provider, coreVersion, now()).run();
    return { worker_id: id, verdict: "accepted" };
  }

  // -- readiness ------------------------------------------------------------
  private viewsJson(rows: Record<string, unknown>[], blobCache: Map<string, unknown>): string {
    const views = rows.map((r) => {
      const view: Record<string, unknown> = { name: r["name"], status: r["status"] };
      if (r["status"] === "succeeded" && r["output_json"]) {
        const envelope = JSON.parse(r["output_json"] as string);
        view["output"] = envelope["type"] === "inline" ? envelope["value"] : blobCache.get(envelopeKey(envelope)) ?? null;
      }
      return view;
    });
    return JSON.stringify(views);
  }

  private edgesJson(dag: Record<string, unknown>): string {
    return JSON.stringify((dag["edges"] as Array<Record<string, unknown>>).map((e) => {
      const core: Record<string, unknown> = { upstream: e["upstream"], downstream: e["downstream"], arg: e["arg"] };
      if (e["predicate"]) core["predicate"] = e["predicate"];
      return core;
    }));
  }

  private async materialize(runId: string, envelope: Record<string, unknown>): Promise<unknown> {
    if (envelope["type"] === "inline") return envelope["value"];
    const blob = envelope["blob"] as Record<string, unknown>;
    const bytes = await this.fetchBlob(runId, blob["key"] as string);
    if (envelope["codec"] === "bytes") return bytes;
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  private async settle(runId: string, workflowId: string): Promise<void> {
    const { dag } = await this.dagOf(workflowId);
    let changed = true;
    while (changed) {
      changed = false;
      const rows = await this.taskRows(runId);
      const blobCache = await this.blobCache(runId, rows);
      const views = this.viewsJson(rows, blobCache);
      const edges = this.edgesJson(dag);
      for (const row of rows) {
        if (row["status"] === "queued" && task_readiness(row["name"] as string, views, edges) === "should_skip") {
          await this.db.prepare("UPDATE tasks SET status = 'skipped' WHERE id = ?").bind(row["id"]).run();
          changed = true;
        }
      }
    }
  }

  private async blobCache(runId: string, rows: Record<string, unknown>[]): Promise<Map<string, unknown>> {
    const cache = new Map<string, unknown>();
    for (const row of rows) {
      if (row["status"] === "succeeded" && row["output_json"]) {
        const envelope = JSON.parse(row["output_json"] as string);
        if (envelope["type"] === "blob") {
          try {
            cache.set(envelopeKey(envelope), await this.materialize(runId, envelope));
          } catch {
            cache.set(envelopeKey(envelope), null);
          }
        }
      }
    }
    return cache;
  }

  private async rollup(runId: string): Promise<void> {
    const rows = await this.taskRows(runId);
    const statuses = rows.map((r) => r["status"] as string);
    let status = "running";
    let finished: number | null = null;
    if (!statuses.length || statuses.every((s) => s === "succeeded" || s === "skipped")) {
      status = "succeeded";
      finished = now();
    } else if (statuses.includes("failed") && !statuses.some((s) => s === "queued" || s === "running")) {
      status = "failed";
      finished = now();
    }
    await this.db.prepare(
      "UPDATE runs SET status = ?, finished_at = COALESCE(?, finished_at), started_at = COALESCE(started_at, ?) WHERE id = ?"
    ).bind(status, finished, now(), runId).run();
  }

  private async reapExpired(runId: string): Promise<void> {
    await this.db.prepare(
      "UPDATE tasks SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL WHERE run_id = ? AND status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?"
    ).bind(runId, now()).run();
  }

  // -- claim / heartbeat / complete / fail ------------------------------------
  async claimTask(workerId: string, language: string, runtime: string, provider: string): Promise<Record<string, unknown> | null> {
    const worker = await this.db.prepare("SELECT * FROM workers WHERE id = ?").bind(workerId).first<Record<string, unknown>>();
    if (!worker) throw new NotFound(workerId);
    if (worker["provider"] !== provider) throw new StoreError("unpaired provider network", 403);
    const runs = (await this.db.prepare("SELECT * FROM runs ORDER BY created_at").all<Record<string, unknown>>()).results ?? [];
    for (const run of runs) {
      const { dag, language: wfLanguage, bundle } = await this.dagOf(run["workflow_id"] as string);
      if (wfLanguage !== language) continue;
      await this.reapExpired(run["id"] as string);
      const rows = await this.taskRows(run["id"] as string);
      const blobCache = await this.blobCache(run["id"] as string, rows);
      const ready: Set<string> = new Set(JSON.parse(next_ready(this.viewsJson(rows, blobCache), this.edgesJson(dag))));
      for (const row of rows) {
        if (row["status"] !== "queued" || !ready.has(row["name"] as string) || row["runtime"] !== runtime) continue;
        const attempt = (row["attempt"] as number) + 1;
        const leaseExpiresAt = now() + this.knobs.leaseSecs;
        // Compare-and-swap: only one claimant wins even across isolates.
        const swapped = await this.db.prepare(
          "UPDATE tasks SET status = 'running', attempt = ?, lease_owner = ?, lease_expires_at = ? WHERE id = ? AND status = 'queued'"
        ).bind(attempt, workerId, leaseExpiresAt, row["id"]).run();
        if (!swapped.meta.changes) continue;
        const code = ((dag["code"] as Record<string, string>) ?? {})[row["name"] as string] ?? "";
        return {
          run_id: run["id"], task_id: row["id"], task_name: row["name"], attempt,
          inputs: await this.runInputs(run["id"] as string, row["name"] as string, dag),
          bundle, bundle_version: run["bundle_version"], code_ref: code,
          source: (dag["source"] as object) ?? {},
          lease_expires_at: leaseExpiresAt,
        };
      }
    }
    return null;
  }

  private async runInputs(runId: string, name: string, dag: Record<string, unknown>): Promise<Record<string, unknown>> {
    const rows = await this.taskRows(runId);
    const byName = new Map(rows.map((r) => [r["name"] as string, r]));
    const inputs: Record<string, unknown> = {};
    const params = (dag["params"] as Record<string, Record<string, unknown>>) ?? {};
    for (const [param, literal] of Object.entries(params[name] ?? {})) {
      const raw = new TextEncoder().encode(JSON.stringify(literal));
      inputs[param] = { type: "inline", codec: "json", size: raw.length, sha256: await sha256Hex(raw), value: literal };
    }
    for (const edge of (dag["edges"] as Array<Record<string, unknown>>)) {
      if (edge["downstream"] !== name) continue;
      const up = byName.get(edge["upstream"] as string);
      if (!up || up["status"] !== "succeeded" || !up["output_json"]) continue;
      const envelope = JSON.parse(up["output_json"] as string);
      const value = await this.materialize(runId, envelope);
      if (edge["predicate"] && !evaluate_predicate(JSON.stringify(value), JSON.stringify(edge["predicate"]))) continue;
      inputs[edge["arg"] as string] = envelope;
    }
    return inputs;
  }

  private async owned(taskId: string, workerId: string): Promise<Record<string, unknown>> {
    const row = await this.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<Record<string, unknown>>();
    if (!row) throw new NotFound(taskId);
    if (row["lease_owner"] !== workerId) throw new LeaseLost(taskId);
    if (row["lease_expires_at"] != null && (row["lease_expires_at"] as number) <= now()) throw new LeaseLost(taskId);
    return row;
  }

  async heartbeat(taskId: string, workerId: string): Promise<Record<string, unknown>> {
    await this.owned(taskId, workerId);
    const leaseExpiresAt = now() + this.knobs.leaseSecs;
    await this.db.prepare("UPDATE tasks SET lease_expires_at = ? WHERE id = ?").bind(leaseExpiresAt, taskId).run();
    return { task_id: taskId, lease_owner: workerId, lease_expires_at: leaseExpiresAt };
  }

  async complete(taskId: string, workerId: string, attempt: number, envelope: Record<string, unknown>): Promise<Record<string, unknown>> {
    const row = await this.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<Record<string, unknown>>();
    if (!row) throw new NotFound(taskId);
    if (["succeeded", "failed", "skipped"].includes(row["status"] as string)) return { ok: true };
    await this.owned(taskId, workerId);
    if (attempt !== row["attempt"]) throw new StoreError("stale attempt");
    const size = (envelope["size"] as number) ?? 0;
    let where: string;
    try {
      where = classify_output(BigInt(size), (row["policy"] as string) ?? "auto", BigInt(this.knobs.inlineThreshold));
    } catch (e) {
      throw new StoreError(`${e}; upload output first via blob endpoint`);
    }
    if (envelope["type"] === "inline" && where === "blob") {
      throw new StoreError(`inline output of ${size} bytes meets the ${this.knobs.inlineThreshold} byte threshold; upload output first via blob endpoint`);
    }
    if (envelope["type"] === "blob" && row["policy"] === "inline-only") {
      throw new StoreError("blob output forbidden under inline-only policy");
    }
    await this.db.prepare(
      "UPDATE tasks SET status = 'succeeded', output_json = ?, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?"
    ).bind(JSON.stringify(envelope), taskId).run();
    const run = await this.db.prepare("SELECT workflow_id, id FROM runs WHERE id = ?").bind(row["run_id"]).first<{ workflow_id: string; id: string }>();
    await this.settle(run!.id, run!.workflow_id);
    await this.rollup(run!.id);
    return { ok: true };
  }

  async fail(taskId: string, workerId: string, attempt: number, error: string): Promise<Record<string, unknown>> {
    const row = await this.owned(taskId, workerId);
    if (attempt !== row["attempt"]) throw new StoreError("stale attempt");
    if (attempt >= this.knobs.maxAttempts) {
      await this.db.prepare("UPDATE tasks SET status = 'failed', error = ?, lease_owner = NULL WHERE id = ?").bind(error, taskId).run();
      const runRow = await this.db.prepare("SELECT run_id FROM tasks WHERE id = ?").bind(taskId).first<{ run_id: string }>();
      await this.rollup(runRow!.run_id);
      return { retry: false };
    }
    await this.db.prepare(
      "UPDATE tasks SET status = 'queued', error = ?, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?"
    ).bind(error, taskId).run();
    return { retry: true, next_attempt: attempt + 1 };
  }

  // -- blobs / R2 ---------------------------------------------------------------
  async storeBlob(runId: string, key: string, bytes: Uint8Array): Promise<{ key: string; size: number; sha256: string }> {
    const fullKey = `${runId}/${key}`;
    await this.bucket.put(fullKey, bytes);
    return { key: fullKey, size: bytes.length, sha256: await sha256Hex(bytes) };
  }

  async fetchBlob(runId: string, key: string): Promise<Uint8Array> {
    const fullKey = key.startsWith(runId + "/") ? key : `${runId}/${key}`;
    const obj = await this.bucket.get(fullKey);
    if (!obj) throw new NotFound(key);
    const buf = await obj.arrayBuffer();
    return new Uint8Array(buf);
  }
}

function envelopeKey(envelope: Record<string, unknown>): string {
  return (envelope["blob"] as Record<string, unknown>)["key"] as string;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function resolveBundleVersion(entry: BundleEntry, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (entry.type === "local") throw new StoreError("local bundles cannot serve remote workers");
  if (entry.type === "git") {
    if (entry.version) return entry.version;
    const m = (entry.url || "").match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!m) throw new StoreError(`git bundle needs an explicit version or a github URL: ${entry.url}`);
    const ref = entry.tracking_ref || "main";
    const res = await fetcher(`https://api.github.com/repos/${m[1]}/${m[2]}/commits/${ref}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new StoreError(`cannot resolve git bundle ${entry.url}@${ref}: ${res.status}`);
    const data = (await res.json()) as { sha?: string };
    if (!data.sha) throw new StoreError(`no sha for git bundle ${entry.url}@${ref}`);
    return data.sha;
  }
  throw new StoreError(`unknown bundle type: ${entry.type}`);
}
