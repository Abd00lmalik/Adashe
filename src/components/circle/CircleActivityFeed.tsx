'use client'

/**
 * CircleActivityFeed
 *
 * Shows computed on-chain activity items for the current circle.
 * Rendered on the Overview tab of the circle page.
 * Items are derived from live on-chain state — no DB writes required.
 */

import { useReadContracts, useAccount } from 'wagmi'
import { adasheContract } from '@/lib/contract'
import { useCircleActivity } from '@/hooks/useCircleActivity'
import { AlertTriangle, Clock, CheckCircle2, Coins, ArrowRightCircle, Users, Bell, Info, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotificationType } from '@prisma/client'
import type { ActivityItem } from '@/hooks/useCircleActivity'

interface CircleActivityFeedProps {
  cid: bigint
}

function itemIcon(type: NotificationType) {
  switch (type) {
    case 'MISSED_PAYMENT':
    case 'DEBT_RECORDED':
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
    case 'GRACE_PERIOD_WARNING':
    case 'DEADLINE_APPROACHING':
    case 'CONTRIBUTION_DUE':
      return <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
    case 'PAYOUT_AVAILABLE':
      return <Coins className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
    case 'PAYOUT_WITHHELD':
      return <Shield className="h-4 w-4 text-terra-400 shrink-0 mt-0.5" />
    case 'PERIOD_STARTED':
    case 'CIRCLE_ACTIVATED':
      return <ArrowRightCircle className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
    case 'PERIOD_FINALIZED':
    case 'CIRCLE_COMPLETED':
      return <CheckCircle2 className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
    case 'MEMBER_JOINED':
    case 'MEMBER_APPROVED':
    case 'MEMBER_REPLACED':
      return <Users className="h-4 w-4 text-forest-400 shrink-0 mt-0.5" />
    default:
      return <Info className="h-4 w-4 text-muted shrink-0 mt-0.5" />
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function itemBg(type: NotificationType) {
  switch (type) {
    case 'MISSED_PAYMENT':
    case 'GRACE_PERIOD_WARNING':
    case 'DEADLINE_APPROACHING':
      return 'bg-amber-50 border-amber-200'
    case 'PAYOUT_AVAILABLE':
    case 'PERIOD_STARTED':
    case 'PERIOD_FINALIZED':
    case 'CIRCLE_COMPLETED':
      return 'bg-forest-50/60 border-forest-200'
    default:
      return 'bg-ivory-50 border-ivory-300'
  }
}

export function CircleActivityFeed({ cid }: CircleActivityFeedProps) {
  const { address } = useAccount()

  // Read circle and current period in one batch
  const { data } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'circles', args: [cid] },
    ],
    query: { staleTime: 0, refetchOnMount: true },
  })

  const circleRaw = data?.[0]?.status === 'success' ? (data[0].result as unknown[]) : null

  if (!circleRaw) return null

  const creator = (circleRaw[1] as string).toLowerCase()
  const memberCount = circleRaw[4] as number
  const frequency = circleRaw[5] as number
  const status = circleRaw[9] as number          // CircleStatus
  const currentPeriodIndex = circleRaw[11] as number
  const reserveAmount = circleRaw[12] as bigint
  const gracePeriodSecs = circleRaw[13] as bigint

  const isCreator = !!address && address.toLowerCase() === creator
  const isActive = status === 1 // CircleStatus.ACTIVE

  return (
    <CircleActivityFeedInner
      cid={cid}
      address={address}
      isCreator={isCreator}
      isActive={isActive}
      memberCount={memberCount}
      frequency={frequency}
      currentPeriodIndex={currentPeriodIndex}
      reserveAmount={reserveAmount}
      gracePeriodSecs={gracePeriodSecs}
    />
  )
}

// Inner component reads period + contribution data
function CircleActivityFeedInner({
  cid,
  address,
  isCreator,
  isActive,
  memberCount,
  frequency,
  currentPeriodIndex,
  reserveAmount,
  gracePeriodSecs,
}: {
  cid: bigint
  address?: string
  isCreator: boolean
  isActive: boolean
  memberCount: number
  frequency: number
  currentPeriodIndex: number
  reserveAmount: bigint
  gracePeriodSecs: bigint
}) {
  // Read current period + all previous periods' payoutReleased
  const periodContracts = [
    { ...adasheContract, functionName: 'getPeriod' as const, args: [cid, BigInt(currentPeriodIndex)] },
    ...Array.from({ length: currentPeriodIndex }, (_, i) => ({
      ...adasheContract, functionName: 'getPeriod' as const, args: [cid, BigInt(i)],
    })),
  ]

  const { data: periodResults } = useReadContracts({
    contracts: periodContracts,
    query: { staleTime: 0, refetchOnMount: true, enabled: isActive },
  })

  const rawPeriod = periodResults?.[0]?.status === 'success'
    ? (periodResults[0].result as unknown[])
    : null

  // Parse current period data
  const periodData = rawPeriod ? {
    recipient: rawPeriod[0] as string,
    deadline: rawPeriod[1] as bigint,
    grossEntitlement: rawPeriod[2] as bigint,
    payoutReleased: rawPeriod[3] as boolean,
    payoutWithheld: rawPeriod[4] as boolean,
    withheldAmount: rawPeriod[5] as bigint,
    claimableAmount: rawPeriod[6] as bigint,
    progressivelyPaid: rawPeriod[7] as bigint,
    participants: rawPeriod[8] as string[],
  } : null

  // Parse previous periods
  const previousPeriods = Array.from({ length: currentPeriodIndex }, (_, i) => {
    const r = periodResults?.[i + 1]
    if (r?.status !== 'success') return { payoutReleased: false }
    const raw = r.result as unknown[]
    return { payoutReleased: raw[3] as boolean }
  })

  // Read all contributions for current period participants
  const participants = periodData?.participants ?? []
  const recipient = periodData?.recipient.toLowerCase() ?? ''
  const nonRecipients = participants.filter((p) => p.toLowerCase() !== recipient)

  const { data: contribResults } = useReadContracts({
    contracts: nonRecipients.map((p) => ({
      ...adasheContract,
      functionName: 'getContribution' as const,
      args: [cid, BigInt(currentPeriodIndex), p as `0x${string}`],
    })),
    query: { staleTime: 0, refetchOnMount: true, enabled: nonRecipients.length > 0 && isActive },
  })

  // Build contribution map
  const contributionMap: Record<string, { status: number; paidAmount: bigint }> = {}
  nonRecipients.forEach((p, i) => {
    const r = contribResults?.[i]
    if (r?.status === 'success') {
      const cr = r.result as { status: number; paidAmount: bigint }
      contributionMap[p.toLowerCase()] = cr
    }
  })

  const items = useCircleActivity({
    circleId: cid,
    address,
    isCreator,
    currentPeriodIndex,
    frequency,
    gracePeriodSecs,
    reserveAmount,
    periodData,
    contributionMap,
    previousPeriods,
  })

  if (!isActive || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
        <Bell className="h-7 w-7 text-ivory-400" />
        <p className="text-sm font-medium text-forest-500">No activity yet</p>
        <p className="text-xs text-muted text-pretty">
          Activity will appear here as deadlines approach, members pay, and periods progress.
        </p>
      </div>
    )
  }

  // Suppress duplicate member count warning for large circles
  const displayItems = items.slice(0, 20)

  return (
    <div className="space-y-2">
      {displayItems.map((item) => (
        <ActivityRow key={item.id} item={item} memberCount={memberCount} />
      ))}
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem; memberCount: number }) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl border p-3',
      itemBg(item.type),
    )}>
      {itemIcon(item.type)}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-forest-500 leading-snug">{item.title}</p>
        <p className="text-xs text-muted mt-0.5 text-pretty leading-relaxed">{item.body}</p>
      </div>
      <span className="text-[11px] text-muted/70 tabular-nums shrink-0 mt-0.5">
        {timeAgo(item.createdAt)}
      </span>
    </div>
  )
}
