import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '~/components/ui/skeleton';
import { PageHead } from '~/components/PageHead';
import { api } from '~/lib/api';

export const Route = createFileRoute('/bundles')({
  component: BundlesPage,
  pendingComponent: BundlesPending,
});

function BundlesPending() {
  return (
    <>
      <PageHead title="Bundles" />
      <div className="card">
        <div className="ch">
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </>
  );
}

function BundlesPage() {
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows });

  const byBundle = new Map<string, string[]>();
  (workflows.data ?? []).forEach((w) => {
    const list = byBundle.get(w.bundle) ?? [];
    list.push(w.id);
    byBundle.set(w.bundle, list);
  });

  return (
    <>
      <PageHead title="Bundles" meta={<span className="role">{byBundle.size} observed</span>} />
      <div className="card tw">
        <div className="ch">
          <b>Server-side bundles</b>
          <span className="mu">Bundles observed across registered workflows. Bundle sources live in orchestrator config.</span>
        </div>
        {workflows.isPending && <Skeleton className="m-4 h-24" />}
        {workflows.isError && <p className="mu" style={{ padding: 16 }}>Failed to load workflows.</p>}
        {workflows.data && (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Workflows</th>
              </tr>
            </thead>
            <tbody>
              {[...byBundle.entries()].map(([name, ids]) => (
                <tr key={name}>
                  <td className="m">{name}</td>
                  <td className="m">{ids.join(', ')}</td>
                </tr>
              ))}
              {byBundle.size === 0 && (
                <tr>
                  <td colSpan={2} className="mu">
                    No bundles observed yet.
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
