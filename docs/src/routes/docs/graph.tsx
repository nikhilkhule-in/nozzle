import { createFileRoute } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { createServerFn } from '@tanstack/react-start';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { GraphBoard } from '@/components/topic-graph';

const graphLoader = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(async () => ({
    pageTree: await source.serializePageTree(source.getPageTree()),
  }));

export const Route = createFileRoute('/docs/graph')({
  loader: async () => await graphLoader(),
  head: () => ({
    meta: [{ title: 'Topic Graph — Nozzle' }],
  }),
  component: Page,
});

function Page() {
  const { pageTree } = useFumadocsLoader(Route.useLoaderData());

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <GraphBoard />
    </DocsLayout>
  );
}
