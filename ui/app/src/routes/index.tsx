import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '~/components/ui/badge';
import { Skeleton } from '~/components/ui/skeleton';
import { TriggerRunDialog } from '~/components/TriggerRunDialog';
import { PageHead } from '~/components/PageHead';
import { api } from '~/lib/api';

export const Route = createFileRoute('/')({
  component: WorkflowsPage,
  pendingComponent: WorkflowsPending,
});

function WorkflowsPending() {
  return (
    <>
      <PageHead title="Workflows" />
      <div className="card tw">
        <Skeleton className="m-4 h-24" />
      </div>
    </>
  );
}

function WorkflowsPage() {
  const navigate = useNavigate();
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows });

  return (
    <>
      <PageHead
        title="Workflows"
        meta={
          <span style={{ display: 'flex', gap: 8 }}>
            <TriggerRunDialog />
          </span>
        }
      />
      <div className="card tw">
        {workflows.isPending && <Skeleton className="m-4 h-24" />}
        {workflows.isError && <p className="mu" style={{ padding: 16 }}>Failed to load workflows.</p>}
        {workflows.data && workflows.data.length === 0 && (
          <p className="mu" style={{ padding: 16 }}>
            No workflows registered.
          </p>
        )}
        {workflows.data && workflows.data.length > 0 && (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Language</th>
                <th>Bundle</th>
                <th>Tasks</th>
              </tr>
            </thead>
            <tbody>
              {workflows.data.map((w) => (
                <tr
                  key={w.id}
                  className="clickable"
                  onClick={() => navigate({ to: '/workflows/$workflowId', params: { workflowId: w.id } })}
                >
                  <td className="m">{w.id}</td>
                  <td>
                    <Badge status="queued">{w.language}</Badge>
                  </td>
                  <td className="m">{w.bundle}</td>
                  <td>{w.dag.tasks.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mu" style={{ marginTop: 12 }}>
        Runs live inside their workflow — open one to see its runs, graph, and logs. Latest run status per
        workflow appears there.
      </p>
    </>
  );
}
