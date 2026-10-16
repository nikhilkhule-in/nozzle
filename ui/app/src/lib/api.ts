export interface TaskSpec {
  name: string;
  runtime: string;
}

export interface Edge {
  upstream: string;
  downstream: string;
  arg: string;
  predicate?: { op: 'equals' | 'not_equals'; value: unknown };
}

export interface Workflow {
  id: string;
  language: string;
  bundle: string;
  dag: { tasks: TaskSpec[]; edges: Edge[] };
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type TaskStatus = RunStatus | 'skipped';

export interface Run {
  id: string;
  workflow_id: string;
  status: RunStatus;
  bundle_version: string;
  created_at?: number;
}

export interface TaskRecord {
  id: string;
  run_id: string;
  name: string;
  status: TaskStatus;
  attempt: number;
  lease_owner: string | null;
  error: string | null;
  output: {
    type: 'inline' | 'blob';
    codec: string;
    size: number;
    sha256: string;
    value?: unknown;
    blob?: { backend: string; key: string; size: number; sha256: string };
  } | null;
}

export interface RunDetail extends Run {
  tasks: TaskRecord[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.detail ?? body?.message ?? `request failed: ${res.status}`);
  }
  return body as T;
}

export const api = {
  listWorkflows: () => req<Workflow[]>('/workflows'),
  getWorkflow: (id: string) => req<Workflow>(`/workflows/${encodeURIComponent(id)}`),
  listRuns: (workflowId: string) =>
    req<Run[]>(`/workflows/${encodeURIComponent(workflowId)}/runs`),
  createRun: (workflowId: string, inputs: Record<string, unknown>) =>
    req<Run>('/runs', { method: 'POST', body: JSON.stringify({ workflow_id: workflowId, inputs }) }),
  getRun: (runId: string) => req<RunDetail>(`/runs/${encodeURIComponent(runId)}`),
  readLogs: async (runId: string, taskId: string, attempt?: number) => {
    const qs = attempt === undefined ? '' : `?attempt=${attempt}`;
    const res = await fetch(`/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/logs${qs}`);
    if (!res.ok) throw new Error(`logs unavailable: ${res.status}`);
    return res.text();
  },
};
