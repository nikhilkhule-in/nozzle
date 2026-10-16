import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { TriggerRunDialog } from '~/components/TriggerRunDialog';
import { api, type Run, type TaskRecord } from '~/lib/api';

const NODE_COLOR: Record<string, string> = {
  succeeded: 'var(--ok)',
  running: 'var(--rn)',
  failed: 'var(--bd)',
  skipped: 'var(--id)',
  queued: 'var(--id)',
};

function layout(dag: { tasks: { name: string }[]; edges: { upstream: string; downstream: string }[] }) {
  const depth: Record<string, number> = {};
  dag.tasks.forEach((t) => (depth[t.name] = 0));
  let changed = true;
  while (changed) {
    changed = false;
    dag.edges.forEach((e) => {
      if ((depth[e.downstream] ?? 0) <= (depth[e.upstream] ?? 0)) {
        depth[e.downstream] = (depth[e.upstream] ?? 0) + 1;
        changed = true;
      }
    });
  }
  const layers: Record<number, string[]> = {};
  dag.tasks.forEach((t) => {
    (layers[depth[t.name]] = layers[depth[t.name]] || []).push(t.name);
  });
  const pos: Record<string, { x: number; y: number }> = {};
  Object.keys(layers).forEach((d) => {
    layers[+d].forEach((n, i) => {
      pos[n] = { x: +d * 230, y: i * 110 };
    });
  });
  return pos;
}

function TaskNode({ data, selected }: { data: { label: string; status: string }; selected?: boolean }) {
  const color = NODE_COLOR[data.status] ?? 'var(--id)';
  return (
    <div
      style={{
        border: `1.5px solid ${selected ? 'var(--ink)' : 'var(--ln)'}`,
        borderWidth: selected ? 3 : 1.5,
        borderRadius: 8,
        background: 'var(--pn)',
        padding: '10px 14px',
        textAlign: 'center',
        minWidth: 150,
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>{data.label}</div>
      <div style={{ fontSize: 10.5, color: 'var(--mu)' }}>{data.status}</div>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, margin: '4px auto 0' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

function kv(label: string, value: React.ReactNode) {
  return (
    <div className="kv">
      <span className="mu">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function RunDetail({
  workflowId,
  runId,
  runs,
  onSelectRun,
  onBack,
}: {
  workflowId: string;
  runId: string;
  runs: Run[];
  onSelectRun: (id: string) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number | null>(null);
  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'running' || s === 'queued' ? 2000 : false;
    },
  });
  const workflow = useQuery({
    queryKey: ['workflow', run.data?.workflow_id],
    queryFn: () => api.getWorkflow(run.data!.workflow_id),
    enabled: !!run.data,
  });
  const task: TaskRecord | null =
    run.data?.tasks.find((t) => t.name === selected) ??
    run.data?.tasks.find((t) => t.status === 'failed') ??
    run.data?.tasks.find((t) => t.status === 'running') ??
    run.data?.tasks[0] ??
    null;
  const showAttempt = attempt ?? task?.attempt ?? 1;
  const logs = useQuery({
    queryKey: ['logs', runId, task?.id, showAttempt],
    queryFn: () => api.readLogs(runId, task!.id, showAttempt),
    enabled: !!task,
    retry: false,
  });

  const { nodes, edges } = useMemo(() => {
    if (!workflow.data || !run.data) return { nodes: [], edges: [] };
    const pos = layout(workflow.data.dag);
    const states = new Map(run.data.tasks.map((t) => [t.name, t.status]));
    const nodes: FlowNode[] = workflow.data.dag.tasks.map((t) => ({
      id: t.name,
      type: 'task',
      position: pos[t.name] ?? { x: 0, y: 0 },
      data: { label: t.name, status: states.get(t.name) ?? 'queued' },
      selected: selected === t.name,
    }));
    const edges: FlowEdge[] = workflow.data.dag.edges.map((e) => ({
      id: `${e.upstream}->${e.downstream}:${e.arg}`,
      source: e.upstream,
      target: e.downstream,
      label: e.predicate ? `${e.predicate.op} ${JSON.stringify(e.predicate.value)}` : undefined,
    }));
    return { nodes, edges };
  }, [workflow.data, run.data, selected]);

  if (run.isPending) {
    return (
      <div className="card">
        <div className="ch">
          <b className="m">{runId}</b>
        </div>
        <div className="sc">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  if (run.isError) return <p className="mu">Failed to load run.</p>;
  const detail = run.data;
  const done = detail.tasks.filter((t) => t.status === 'succeeded').length;
  const retries = detail.tasks.reduce((n, t) => n + Math.max(0, t.attempt - 1), 0);
  const events = detail.tasks.filter((t) => t.attempt > 1 || t.error || t.status === 'failed');

  return (
    <>
      <div className="card">
        <div className="ch">
          <Button variant="secondary" onClick={onBack}>
            All workflows
          </Button>
          <span className="mu">
            {workflowId} · bundle {detail.bundle_version}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <TriggerRunDialog preset={workflowId} />
          </span>
        </div>
      </div>
      <div className="wf">
        <div className="wm">
          <div className="card">
            <div className="ch">
              <b className="m">{detail.id}</b>
              <Badge status={detail.status}>{detail.status}</Badge>
            </div>
            <div className="sc">
              <div style={{ height: 380 }} className="rounded-md border">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_, node) => {
                    setSelected(node.id);
                    setAttempt(null);
                  }}
                  fitView
                  proOptions={{ hideAttribution: true }}
                  colorMode="light"
                >
                  <Background gap={24} size={1} />
                </ReactFlow>
              </div>
            </div>
            {events.length > 0 && (
              <div className="evs">
                <div className="mu" style={{ marginBottom: 4 }}>
                  Retries and failures in this run. Select a row to open that task's log.
                </div>
                {events.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelected(t.name);
                      setAttempt(null);
                    }}
                  >
                    <span className="m mu">attempt {t.attempt}</span>
                    <span className="m">{t.name}</span>
                    <span className={t.status === 'failed' ? 'lb' : 'la'}>
                      {t.status === 'failed' ? 'failed' : `attempt ${t.attempt} started`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="lp">
              <div className="mu" style={{ marginBottom: 6 }}>
                <b className="m">{task ? task.name : 'Select a task in the graph'}</b>
                {task && task.attempt > 1 && (
                  <>
                    {Array.from({ length: task.attempt }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        className="chip"
                        style={showAttempt === n ? { borderColor: 'var(--ink)' } : undefined}
                        onClick={() => setAttempt(n)}
                      >
                        attempt {n}
                      </button>
                    ))}
                  </>
                )}
              </div>
              <div className="lgw">
                {!task && <pre>No log yet. Select a task to read its log.</pre>}
                {task && logs.isPending && <pre>Loading…</pre>}
                {task && logs.isError && <pre>No log yet. This task starts when its upstream tasks succeed.</pre>}
                {task && logs.data !== undefined && <pre>{logs.data}</pre>}
              </div>
            </div>
          </div>
        </div>
        <aside className="rs" aria-label="Runs and details">
          <div className="card">
            <h3>Runs</h3>
            <div className="rl">
              {runs.map((r) => (
                <button
                  key={r.id}
                  className={'ri' + (r.id === detail.id ? ' on' : '')}
                  aria-current={r.id === detail.id}
                  onClick={() => onSelectRun(r.id)}
                >
                  <span className="m">{r.id}</span>
                  <Badge status={r.status}>{r.status}</Badge>
                  <span className="mu" style={{ flexBasis: '100%' }}>
                    bundle {r.bundle_version}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="m">{detail.id}</h3>
            {kv('Status', <Badge status={detail.status}>{detail.status}</Badge>)}
            {kv('Version', detail.bundle_version)}
            {kv('Retries', retries)}
            {kv('Progress', `${done} of ${detail.tasks.length} tasks`)}
            <div className="bar6">
              <i style={{ width: `${(done / Math.max(detail.tasks.length, 1)) * 100}%` }} />
            </div>
          </div>
          {task && (
            <div className="card">
              <h3 className="m">{task.name}</h3>
              {kv('State', <Badge status={task.status}>{task.status}</Badge>)}
              {kv('Attempt', `${task.attempt} of 3`)}
              {kv('Lease', task.lease_owner ?? 'none')}
              {kv('Output', task.output ? (task.output.type === 'inline' ? JSON.stringify(task.output.value) : `${task.output.codec} blob`) : 'none')}
            </div>
          )}
          <div className="card">
            <h3>Workflow</h3>
            {kv('ID', <span className="m">{workflowId}</span>)}
            {kv('Language', workflow.data?.language ?? '—')}
            {kv('Bundle', workflow.data?.bundle ?? '—')}
            {kv('Runs', runs.length)}
          </div>
        </aside>
      </div>
    </>
  );
}
