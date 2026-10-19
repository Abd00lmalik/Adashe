'use client'

import { useEffect, useState } from 'react'
import { formatCountdown, secondsUntil } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface CountdownTimerProps {
  /** Unix timestamp in seconds */
  deadline: bigint | number
  className?: string
  expiredLabel?: string
}

export function CountdownTimer({
  deadline,
  className,
  expiredLabel = 'Expired',
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => secondsUntil(deadline))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(secondsUntil(deadline))
    }, 60_000) // update every minute
    return () => clearInterval(interval)
  }, [deadline])

  const isExpired = remaining <= 0
  const isUrgent = remaining > 0 && remaining < 86400 // < 1 day

  return (
    <span
      className={cn(
        'font-mono text-sm tabular-nums',
        isExpired && 'text-danger',
        isUrgent && !isExpired && 'text-warning',
        !isExpired && !isUrgent && 'text-forest-500',
        className
      )}
    >
      {isExpired ? expiredLabel : formatCountdown(remaining)}
    </span>
  )
}
