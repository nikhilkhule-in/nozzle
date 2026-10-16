import * as React from 'react';

import { cn } from '~/lib/utils';

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="tw">
      <table className={cn('grid-table', className)} {...props} />
    </div>
  );
}

export function TableHead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({
  className,
  clickable,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean; selected?: boolean }) {
  return <tr className={cn(clickable && 'clickable', selected && 'on', className)} {...props} />;
}

export function TableHeader({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} />;
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={className} {...props} />;
}
