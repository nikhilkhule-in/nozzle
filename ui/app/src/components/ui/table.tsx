import * as React from 'react';

import { cn } from '~/lib/utils';

function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

function TableHead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

function TableRow({ className, clickable, selected, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean; selected?: boolean }) {
  return (
    <tr
      className={cn('border-b border-[var(--border)] last:border-0', clickable && 'cursor-pointer hover:bg-[#1a2030]', selected && 'bg-[#1d2532]', className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-2 py-1.5 text-left font-medium text-[var(--muted)]', className)} {...props} />;
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-2 py-1.5', className)} {...props} />;
}

export { Table, TableHead, TableBody, TableRow, TableHeader, TableCell };
