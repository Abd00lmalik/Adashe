'use client'

import { useReadContracts } from 'wagmi'
import { adasheContract } from '@/lib/contract'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { CountdownTimer } from '@/components/ui/CountdownTimer'
import { AddressDisplay } from '@/components/ui/AddressDisplay'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDeadline, sameAddress } from '@/lib/utils'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'

interface PeriodTimelineProps {
  cid: bigint
  circleRaw: readonly unknown[]
  address?: string
}

export function PeriodTimeline({ cid, circleRaw, address }: PeriodTimelineProps) {
  const [, , , , memberCount, , , , , , , currentPeriod] = circleRaw as [
    bigint, string, string, bigint, number, number, number, number, string, number, bigint, number, bigint, bigint
  ]

  const periodContracts = Array.from({ length: memberCount }, (_, i) => ({
    ...adasheContract,
    functionName: 'getPeriod' as const,
    args: [cid, BigInt(i)],
  }))

  const { data: periodsData, isLoading } = useReadContracts({
    contracts: periodContracts,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: memberCount }, (_, i) => {
        const pd = periodsData?.[i]?.status === 'success'
          ? (periodsData[i].result as [string, bigint, bigint, boolean, boolean, bigint, string[]])
          : null

        const [recipient, deadline, grossEntitlement, payoutReleased, payoutWithheld, withheldAmount, participants] =
          pd ?? ['', 0n, 0n, false, false, 0n, []]

        const isCurrent = i === Number(currentPeriod)
        const isPast = i < Number(currentPeriod)
        const isFuture = i > Number(currentPeriod)
        const isRecipient = sameAddress(recipient as string, address)

        return (
          <div
            key={i}
            className={`card px-4 sm:px-5 py-4 ${isCurrent ? 'ring-2 ring-terra-400/40' : ''}`}
          >
            {/* Main row: period number + info on left, amount + time on right */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5 ${
                    isPast
                      ? 'bg-forest-100 text-forest-500'
                      : isCurrent
                      ? 'bg-terra-400 text-white'
                      : 'bg-ivory-300 text-muted'
                  }`}
                >
                  {isPast ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <div className="min-w-0">
                  {/* Badges wrap on mobile */}
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="font-medium text-sm text-forest-500 shrink-0">Period {i + 1}</span>
                    {isCurrent && <Badge variant="terra">Current</Badge>}
                    {payoutReleased && <Badge variant="active">Paid out</Badge>}
                    {payoutWithheld && <Badge variant="warning">Withheld</Badge>}
                    {isRecipient && <Badge variant="default">You receive</Badge>}
                  </div>
                  {recipient !== '' && (
                    <div className="flex items-center gap-1 mt-0.5 min-w-0">
                      <span className="text-xs text-muted shrink-0">Recipient:</span>
                      <AddressDisplay address={recipient as string} chars={3} showExplorer={false} className="text-xs min-w-0" />
                    </div>
                  )}
                </div>
              </div>

              {/* Amount + deadline — stack on very small if needed */}
              <div className="text-right shrink-0 ml-2">
                {(grossEntitlement as bigint) > 0n && (
                  <UsdcAmount amount={grossEntitlement as bigint} size="sm" />
                )}
                {(deadline as bigint) > 0n && (
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    <Clock className="h-3 w-3 text-muted shrink-0" />
                    {isCurrent || isFuture ? (
                      <CountdownTimer deadline={deadline as bigint} className="text-xs" />
                    ) : (
                      <span className="text-xs text-muted">{formatDeadline(deadline as bigint)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {payoutWithheld && withheldAmount > 0n && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Payout withheld: <UsdcAmount amount={withheldAmount as bigint} size="sm" className="text-amber-700" />
                Recipient has outstanding debt
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
