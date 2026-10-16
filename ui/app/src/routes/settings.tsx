import { createFileRoute } from '@tanstack/react-router';

import { PageHead } from '~/components/PageHead';

const KNOBS: [string, string, string][] = [
  ['poll interval', '10s', 'worker claim short-poll'],
  ['heartbeat', '15s', 'lease renewal cadence'],
  ['lease duration', '60s', 'expiry without heartbeat'],
  ['max attempts', '3', 'per task, then failed'],
  ['inline threshold N', '64KB', 'per orchestrator; above goes to blob'],
  ['max single-shot blob', '10MB', 'chunked upload later'],
  ['core version', '0.1.0', 'lockstep with SDKs'],
];

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHead title="Settings" />
      <div className="card tw">
        <div className="ch">
          <b>Orchestrator knobs</b>
          <span className="mu">MVP defaults. Auth boundary: Cloudflare Access (no in-app RBAC). Triggers: manual only.</span>
        </div>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Knob</th>
              <th>Default</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {KNOBS.map(([k, v, n]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="m">{v}</td>
                <td className="mu">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
