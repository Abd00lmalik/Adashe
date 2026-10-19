import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-forest-100 text-forest-500',
        pending: 'bg-amber-100 text-amber-700',
        active: 'bg-green-100 text-green-700',
        completed: 'bg-forest-100 text-forest-500',
        danger: 'bg-red-100 text-red-700',
        warning: 'bg-orange-100 text-orange-700',
        info: 'bg-blue-100 text-blue-700',
        terra: 'bg-terra-50 text-terra-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
