import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: WorkflowsPage,
})

function WorkflowsPage() {
  return (
    <section>
      <h2>Workflows</h2>
      <p className="muted">Workflow list lands in task 7.2.</p>
    </section>
  )
}
