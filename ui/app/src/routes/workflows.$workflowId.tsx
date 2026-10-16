import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/workflows/$workflowId')({
  component: WorkflowPage,
})

function WorkflowPage() {
  const { workflowId } = Route.useParams()
  return (
    <section>
      <h2>{workflowId}</h2>
      <p className="muted">Workflow view with runs lands in task 7.3.</p>
    </section>
  )
}
