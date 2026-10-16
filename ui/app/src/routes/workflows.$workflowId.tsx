import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { RunDetail } from '~/components/RunDetail';
import { Skeleton } from '~/components/ui/skeleton';
import { PageHead } from '~/components/PageHead';
import { api } from '~/lib/api';

const searchSchema = z.object({ run: z.string().optional() });

export const Route = createFileRoute('/workflows/$workflowId')({
  validateSearch: (search) => searchSchema.parse(search),
  component: WorkflowPage,
  pendingComponent: WorkflowPending,
});

function WorkflowPending() {
  return (
    <>
      <PageHead title="…" />
      <div className="card">
        <div className="ch">
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </>
  );
}

function WorkflowPage() {
  const { workflowId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const runs = useQuery({
    queryKey: ['runs', workflowId],
    queryFn: () => api.listRuns(workflowId),
    refetchInterval: 2000,
  });

  if (runs.isPending) return <WorkflowPending />;
  if (runs.isError) return <p className="mu">Failed to load runs.</p>;
  const list = runs.data;
  const selected = search.run ?? list[0]?.id ?? null;

  const selectRun = (id: string) =>
    navigate({ to: '/workflows/$workflowId', params: { workflowId }, search: { run: id } });

  return (
    <>
      <PageHead title={workflowId} meta={<span className="role">{list.length} runs</span>} />
      {selected ? (
        <RunDetail
          workflowId={workflowId}
          runId={selected}
          runs={list}
          onSelectRun={selectRun}
          onBack={() => navigate({ to: '/' })}
        />
      ) : (
        <p className="mu">No runs yet. Trigger one from the Workflows table.</p>
      )}
    </>
  );
}
