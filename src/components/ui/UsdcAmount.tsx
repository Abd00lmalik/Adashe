import { formatUsdc } from '@/lib/usdc'
import { cn } from '@/lib/utils'

interface UsdcAmountProps {
  /** Raw uint256 USDC amount (6-decimal ERC-20 view) */
  amount: bigint | string | number
  decimals?: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl font-semibold',
  xl: 'text-3xl font-bold tracking-tighter',
}

export function UsdcAmount({
  amount,
  decimals = 2,
  showLabel = true,
  size = 'md',
  className,
}: UsdcAmountProps) {
  const raw = BigInt(amount.toString())
  const formatted = formatUsdc(raw, decimals)

  return (
    <span className={cn('usdc-amount inline-flex items-baseline gap-1', sizeClasses[size], className)}>
      <span>{formatted}</span>
      {showLabel && (
        <span className={cn('text-muted font-normal', size === 'xl' ? 'text-lg' : 'text-xs')}>
          USDC
        </span>
      )}
    </span>
  )
}
