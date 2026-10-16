import { Button as ButtonPrimitive } from '@base-ui/react/button';

import { cn } from '~/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'link';
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
}

export function Button({ className, variant = 'default', size = 'default', ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      className={cn('b', variant === 'default' && 'pr', size === 'sm' && 'text-xs', className)}
      {...props}
    />
  );
}
