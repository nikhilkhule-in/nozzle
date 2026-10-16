import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '~/components/ui/badge';
import { Card, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { TriggerRunDialog } from '~/components/TriggerRunDialog';
import { api } from '~/lib/api';

export const Route = createFileRoute('/')({
  component: WorkflowsPage,
  pendingComponent: WorkflowsPending,
})

function WorkflowsPending() {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2>Workflows</h2>
      </div>
      <Card>
        <CardTitle>All workflows</CardTitle>
        <Skeleton className="mt-2 h-24 w-full" />
      </Card>
    </div>
  )
};

function WorkflowsPage() {
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows });

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2>Workflows</h2>
        <TriggerRunDialog />
      </div>
      <Card>
        <CardTitle>All workflows</CardTitle>
        {workflows.isPending && <Skeleton className="mt-2 h-24 w-full" />}
        {workflows.isError && <p>Failed to load workflows.</p>}
        {workflows.data && workflows.data.length === 0 && <p className="muted">No workflows registered.</p>}
        {workflows.data && workflows.data.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>ID</TableHeader>
                <TableHeader>Language</TableHeader>
                <TableHeader>Bundle</TableHeader>
                <TableHeader>Tasks</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {workflows.data.map((w) => (
                <TableRow key={w.id} clickable>
                  <TableCell>
                    <Link to="/workflows/$workflowId" params={{ workflowId: w.id }} className="font-mono">
                      {w.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge status="queued">{w.language}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{w.bundle}</TableCell>
                  <TableCell>{w.dag.tasks.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
