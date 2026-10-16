import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { Badge } from '~/components/ui/badge';
import { Card, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { RunDetail } from '~/components/RunDetail';
import { TriggerRunDialog } from '~/components/TriggerRunDialog';
import { api } from '~/lib/api';

const searchSchema = z.object({ run: z.string().optional() });

function WorkflowPending() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-8 w-64" />
      <Card>
        <CardTitle>Runs of this workflow</CardTitle>
        <Skeleton className="mt-2 h-24 w-full" />
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/workflows/$workflowId')({
  validateSearch: (search) => searchSchema.parse(search),
  component: WorkflowPage,
  pendingComponent: WorkflowPending,
});

function WorkflowPage() {
  const { workflowId } = Route.useParams();
  const search = Route.useSearch();
  const workflow = useQuery({ queryKey: ['workflow', workflowId], queryFn: () => api.getWorkflow(workflowId) });
  const runs = useQuery({
    queryKey: ['runs', workflowId],
    queryFn: () => api.listRuns(workflowId),
    refetchInterval: 2000,
  });

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono">{workflowId}</h2>
        <TriggerRunDialog preset={workflowId} />
      </div>
      {workflow.data && (
        <p className="muted text-sm">
          {workflow.data.language} · bundle {workflow.data.bundle} · {workflow.data.dag.tasks.length} tasks
        </p>
      )}
      <Card>
        <CardTitle>Runs of this workflow</CardTitle>
        {runs.isPending && <Skeleton className="mt-2 h-24 w-full" />}
        {runs.isError && <p>Failed to load runs.</p>}
        {runs.data && runs.data.length === 0 && <p className="muted">No runs yet. Trigger one above.</p>}
        {runs.data && runs.data.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Run</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Bundle version</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.data.map((r) => (
                <TableRow key={r.id} clickable selected={search.run === r.id}>
                  <TableCell>
                    <Link
                      to="/workflows/$workflowId"
                      params={{ workflowId }}
                      search={{ run: r.id }}
                      className="font-mono"
                    >
                      {r.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge status={r.status}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.bundle_version}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {search.run && <RunDetail runId={search.run} />}
    </div>
  );
}
