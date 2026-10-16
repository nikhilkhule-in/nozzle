import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/workers')({
  component: WorkersPage,
})

function WorkersPage() {
  return (
    <section>
      <h2>Workers</h2>
      <p className="muted">Registered fleet lands in task 7.2.</p>
    </section>
  )
}
