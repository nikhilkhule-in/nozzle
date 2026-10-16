const STATUS_VAR: Record<string, string> = {
  succeeded: 'var(--ok)',
  success: 'var(--ok)',
  running: 'var(--rn)',
  failed: 'var(--bd)',
  rejected: 'var(--bd)',
  skipped: 'var(--mu)',
  queued: 'var(--id)',
  waiting: 'var(--id)',
};

export function Badge({ status, children }: { status: string; children?: React.ReactNode }) {
  return (
    <span className="pl">
      <i style={{ background: STATUS_VAR[status] ?? 'var(--id)' }} />
      {children ?? status}
    </span>
  );
}
