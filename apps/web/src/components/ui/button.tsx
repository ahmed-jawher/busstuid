import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground active:opacity-90',
        outline: 'border border-border bg-surface text-foreground active:bg-background',
        danger: 'bg-alert text-alert-foreground active:opacity-90',
        ghost: 'text-foreground active:bg-surface',
      },
      size: {
        md: 'h-11 px-4 text-base',
        // Driver screens: never below 56px touch targets (PLAN §13).
        touch: 'min-h-touch min-w-touch px-5 text-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
