import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-violet text-on-violet hover:bg-violet-hover',
        secondary: 'border border-border-strong bg-surface text-text-2 hover:text-text',
        ghost: 'text-text-2 hover:text-text',
      },
      size: { md: 'h-10 px-4', sm: 'h-9 px-3' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ variant, size, className, type = 'button', ...props }: Props) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />;
}
