import * as React from 'react';

import { cn } from '~/lib/utils';

const badgeColors: Record<string, string> = {
  succeeded: 'text-[var(--ok)]',
  success: 'text-[var(--ok)]',
  running: 'text-[var(--running)]',
  failed: 'text-[var(--failed)]',
  skipped: 'text-[var(--skipped)]',
  queued: 'text-[var(--muted)]',
};

function Badge({ className, status, ...props }: React.HTMLAttributes<HTMLSpanElement> & { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-medium',
        badgeColors[status] ?? '',
        className,
      )}
      {...props}
    >
      <i className="inline-block h-2 w-2 rounded-full bg-current" />
      {status}
    </span>
  );
}

export { Badge };
