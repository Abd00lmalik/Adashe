'use client'

import { useReadContracts } from 'wagmi'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ChevronRight, Clock, AlertTriangle } from 'lucide-react'
import { adasheContract, CircleStatus, CIRCLE_STATUS_LABELS } from '@/lib/contract'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { CountdownTimer } from '@/components/ui/CountdownTimer'
import { CircleStatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { sameAddress } from '@/lib/utils'
import { useMemo } from 'react'

interface CircleCardProps {
  circleId: bigint
}

export function CircleCard({ circleId }: CircleCardProps) {
  const { address } = useAccount()

  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'circles', args: [circleId] },
      ...(address
        ? [{ ...adasheContract, functionName: 'memberRecords', args: [circleId, address as `0x${string}`] }]
        : []),
    ],
  })

  const circleData = data?.[0]?.status === 'success' ? data[0].result : null
  const memberData = data?.[1]?.status === 'success' ? data[1].result : null

  const memberCount: number = circleData
    ? (circleData as [bigint, string, string, bigint, number, ...unknown[]])[4]
    : 0

  const approved = memberData
    ? (memberData as [boolean, boolean, bigint, bigint, bigint, string])[0]
    : false

  // Read per-period creditor debt to distinguish real debt from reserve repayment.
  // Only enabled when the member is approved and we have a memberCount.
  const debtContracts = useMemo(() =>
    approved && address && memberCount > 0
      ? Array.from({ length: memberCount }, (_, i) => ({
          ...adasheContract,
          functionName: 'getDebtByPeriod' as const,
          args: [circleId, BigInt(i), address as `0x${string}`],
        }))
      : [],
    [approved, address, memberCount, circleId]
  )

  const { data: debtData } = useReadContracts({
    contracts: debtContracts,
    query: { enabled: debtContracts.length > 0 },
  })

  const creditorDebtTotal = useMemo(() => {
    if (!debtData) return 0n
    return debtData.reduce((sum, r) => {
      if (r?.status !== 'success') return sum
      return sum + (r.result as bigint)
    }, 0n)
  }, [debtData])

  if (isLoading) return <Skeleton className="h-48 rounded-2xl" />

  if (!circleData) {
    return (
      <div className="card p-5 text-sm text-muted">
        Circle #{circleId.toString()}: not found
      </div>
    )
  }

  const [
    cId, creator, name, contributionAmount, , , , , , status, startTime, currentPeriod, ,
  ] = circleData as [bigint, string, string, bigint, number, number, number, number, string, number, bigint, number, bigint, bigint]

  const isCreator = sameAddress(creator, address)
  // Only show blocking debt banner for creditor debt — not reserve repayment.
  const hasBlockingDebt = creditorDebtTotal > 0n

  return (
    <Link href={`/circles/${cId.toString()}`} className="block group">
      <div className="card p-5 transition-all hover:shadow-card-hover">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-forest-500 text-base truncate">
              {name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <CircleStatusBadge status={status} />
              {isCreator && (
                <span className="text-xs bg-terra-50 text-terra-400 px-2 py-0.5 rounded-full font-medium">
                  Creator
                </span>
              )}
              {approved && !isCreator && (
                <span className="text-xs bg-forest-50 text-forest-400 px-2 py-0.5 rounded-full font-medium">
                  Member
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted shrink-0 mt-1 group-hover:text-forest-500 transition-colors" />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted">
            <span>Contribution</span>
            <UsdcAmount amount={contributionAmount} size="sm" />
          </div>
          <div className="flex justify-between text-muted">
            <span>Members</span>
            <span>{memberCount}</span>
          </div>
          {status === CircleStatus.ACTIVE && (
            <div className="flex justify-between text-muted">
              <span>Period</span>
              <span>
                {Number(currentPeriod) + 1} of {memberCount}
              </span>
            </div>
          )}
        </div>

        {/* Only show debt warning for genuine creditor debt — reserve repayment is not blocking */}
        {hasBlockingDebt && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            You have outstanding debt. Payout blocked.
          </div>
        )}

        {status === CircleStatus.ACTIVE && startTime > 0n && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3 w-3" />
            Active since {new Date(Number(startTime) * 1000).toLocaleDateString()}
          </div>
        )}
      </div>
    </Link>
  )
}
