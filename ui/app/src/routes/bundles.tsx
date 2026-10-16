import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/bundles')({
  component: BundlesPage,
})

function BundlesPage() {
  return (
    <section>
      <h2>Bundles</h2>
      <p className="muted">Server-side bundle config lands in task 7.2.</p>
    </section>
  )
}
