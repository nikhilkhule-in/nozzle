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
import { Card, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { api, type RunDetail as Run, type TaskRecord } from '~/lib/api';
import { cn } from '~/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'var(--ok)',
  running: 'var(--running)',
  failed: 'var(--failed)',
  skipped: 'var(--skipped)',
  queued: 'var(--muted)',
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
  const names = Object.keys(layers);
  names.forEach((d) => {
    layers[+d].forEach((n, i) => {
      pos[n] = { x: +d * 230, y: i * 110 };
    });
  });
  return pos;
}

function TaskNode({ data, selected }: { data: { label: string; status: string }; selected?: boolean }) {
  const color = STATUS_COLOR[data.status] ?? 'var(--muted)';
  return (
    <div
      className={cn('rounded-lg border bg-[#10141b] px-3 py-2 text-center')}
      style={{ borderColor: selected ? 'var(--primary)' : color, borderWidth: selected ? 2 : 1, minWidth: 150 }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="font-mono text-xs">{data.label}</div>
      <div className="text-[11px]" style={{ color }}>
        {data.status}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

function formatOutput(task: TaskRecord) {
  const out = task.output;
  if (!out) return '—';
  if (out.type === 'inline') return JSON.stringify(out.value);
  return `${out.codec} blob ${out.blob?.size ?? '?'}B · ${out.blob?.key}`;
}

export function RunDetail({ runId }: { runId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
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
  const task = run.data?.tasks.find((t) => t.name === selected) ?? null;
  const logs = useQuery({
    queryKey: ['logs', runId, task?.id],
    queryFn: () => api.readLogs(runId, task!.id),
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

  if (run.isPending || workflow.isPending) {
    return (
      <Card>
        <CardTitle>Run {runId}</CardTitle>
        <Skeleton className="mt-2 h-64 w-full" />
      </Card>
    );
  }
  if (run.isError) return <p>Failed to load run.</p>;

  return (
    <div className="grid gap-3">
      <Card>
        <CardTitle>
          Run {run.data.id} <Badge status={run.data.status}>{run.data.status}</Badge>
        </CardTitle>
        <p className="muted font-mono text-xs">bundle {run.data.bundle_version}</p>
        <div style={{ height: 380 }} className="mt-2 rounded-md border border-[var(--border)] bg-[#10141b]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelected(node.id)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} />
          </ReactFlow>
        </div>
      </Card>
      <Card>
        <CardTitle>Details {task ? <span className="font-mono normal-case">{task.name}</span> : null}</CardTitle>
        {!task && <p className="muted text-sm">Select a node in the graph.</p>}
        {task && (
          <dl className="grid grid-cols-[130px_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="muted">state</dt>
            <dd>
              <Badge status={task.status}>{task.status}</Badge>
            </dd>
            <dt className="muted">attempt</dt>
            <dd>
              {task.attempt} / 3
            </dd>
            <dt className="muted">lease owner</dt>
            <dd className="font-mono">{task.lease_owner ?? '—'}</dd>
            <dt className="muted">output</dt>
            <dd className="font-mono break-all">{formatOutput(task)}</dd>
            {task.error && (
              <>
                <dt className="muted">error</dt>
                <dd className="font-mono break-all text-[var(--failed)]">{task.error}</dd>
              </>
            )}
          </dl>
        )}
      </Card>
      <Card>
        <CardTitle>Logs (final blob)</CardTitle>
        {!task && <p className="muted text-sm">[no task selected]</p>}
        {task && logs.isPending && <Skeleton className="mt-2 h-20 w-full" />}
        {task && logs.isError && <p className="muted text-sm">(no log blob yet)</p>}
        {task && logs.data !== undefined && <pre className="mt-2">{logs.data}</pre>}
      </Card>
    </div>
  );
}
