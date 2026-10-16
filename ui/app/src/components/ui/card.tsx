import * as React from 'react'

import { cn } from '~/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border border-[var(--border)] bg-[var(--card)] p-3', className)}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-xs uppercase tracking-wider text-[var(--muted)]', className)}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

export { Card, CardTitle }
