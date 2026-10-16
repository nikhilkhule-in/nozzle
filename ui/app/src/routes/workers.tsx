import { createFileRoute } from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';

import { Badge } from '~/components/ui/badge';
import { Skeleton } from '~/components/ui/skeleton';
import { PageHead } from '~/components/PageHead';
import { api } from '~/lib/api';

export const Route = createFileRoute('/workers')({
  component: WorkersPage,
  pendingComponent: WorkersPending,
});

function WorkersPending() {
  return (
    <>
      <PageHead title="Workers" />
      <div className="card">
        <div className="ch">
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </>
  );
}

function WorkersPage() {
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows });
  const latest = useQueries({
    queries: (workflows.data ?? []).map((w) => ({
      queryKey: ['runs', w.id, 'latest'],
      queryFn: async () => {
        const runs = await api.listRuns(w.id);
        if (!runs.length) return null;
        return api.getRun(runs[runs.length - 1].id);
      },
      enabled: !!workflows.data,
    })),
  });

  const seen = new Map<string, { runtime: string; run: string; state: string }>();
  latest.forEach((q) => {
    if (!q.data) return;
    const runId = q.data.id;
    q.data.tasks.forEach((t) => {
      if (t.lease_owner && !seen.has(t.lease_owner)) {
        seen.set(t.lease_owner, { runtime: 'worker', run: runId, state: t.status });
      }
    });
  });
  const loading = workflows.isPending || latest.some((q) => q.isPending);

  return (
    <>
      <PageHead title="Workers" meta={<span className="role">{seen.size} observed</span>} />
      <div className="card tw">
        <div className="ch">
          <b>Worker activity</b>
          <span className="mu">Workers observed as lease owners on latest runs. Fleet registration already works.</span>
        </div>
        {loading && <Skeleton className="m-4 h-24" />}
        {workflows.isError && <p className="mu" style={{ padding: 16 }}>Failed to load workflows.</p>}
        {!loading && (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Last run</th>
                <th>Task state</th>
              </tr>
            </thead>
            <tbody>
              {[...seen.entries()].map(([id, info]) => (
                <tr key={id}>
                  <td className="m">{id}</td>
                  <td className="m">{info.run}</td>
                  <td>
                    <Badge status={info.state}>{info.state}</Badge>
                  </td>
                </tr>
              ))}
              {seen.size === 0 && (
                <tr>
                  <td colSpan={3} className="mu">
                    No worker activity yet. Trigger a run and start a worker.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
