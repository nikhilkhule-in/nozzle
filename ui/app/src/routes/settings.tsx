import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <section>
      <h2>Settings</h2>
      <p className="muted">Orchestrator knobs land in task 7.2.</p>
    </section>
  )
}
