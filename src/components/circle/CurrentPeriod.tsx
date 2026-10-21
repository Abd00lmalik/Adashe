'use client'

import { useState } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { adasheContract, CONTRACT_ABI, CircleStatus } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { CountdownTimer } from '@/components/ui/CountdownTimer'
import { ContributionStatusBadge } from '@/components/ui/StatusBadge'
import { AddressDisplay } from '@/components/ui/AddressDisplay'
import { UsdcApproveAndAction } from '@/components/tx/UsdcApproveAndAction'
import { TxButton, type TxState } from '@/components/tx/TxButton'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDeadline, sameAddress, isExpired } from '@/lib/utils'
import { isGraceExpired, GRACE_PERIOD_BY_FREQUENCY, graceExpiry } from '@/lib/schedule'
import { Frequency } from '@/lib/contract'
import { Clock, Users, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface CurrentPeriodProps {
  cid: bigint
  circleRaw: readonly unknown[]
  address?: string
}

export function CurrentPeriod({ cid, circleRaw, address }: CurrentPeriodProps) {
  // indices: 0=id, 1=creator, 2=name, 3=contributionAmount, 4=memberCount,
  // 5=frequency, 6=weekday, 7=anchorDay, 8=pinHash, 9=status,
  // 10=startTime, 11=currentPeriod, 12=reserveAmount, 13=gracePeriod
  const [, , , contributionAmount, memberCount, frequency, , , , status, , currentPeriod] = circleRaw as [
    bigint, string, string, bigint, number, number, number, number, string, number, bigint, number, bigint, bigint
  ]

  const periodIndex = BigInt(currentPeriod as number)

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'getPeriod', args: [cid, periodIndex] },
      ...(address
        ? [{ ...adasheContract, functionName: 'getContribution', args: [cid, periodIndex, address as `0x${string}`] }]
        : []),
    ],
    query: { staleTime: 15_000 },
  })

  const periodData = data?.[0]?.status === 'success'
    ? (data[0].result as [string, bigint, bigint, boolean, boolean, bigint, string[]])
    : null
  const contributionData = data?.[1]?.status === 'success'
    ? data[1].result
    : null

  const [contributeTxState, setContributeTxState] = useState<TxState>({ status: 'idle' })
  const [finalizeTxState, setFinalizeTxState] = useState<TxState>({ status: 'idle' })

  const { writeContractAsync } = useWriteContract()

  if ((status as unknown as number) === CircleStatus.PENDING) {
    return (
      <Card>
        <CardHeader><CardTitle>Circle Pending</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Waiting for all {memberCount} members to join and be approved before the circle activates.
          </p>
        </CardContent>
      </Card>
    )
  }

  if ((status as unknown as number) === CircleStatus.COMPLETED) {
    return (
      <Card>
        <CardHeader><CardTitle>Circle Completed</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            All {memberCount} periods are complete. Claim your reserve refund if you have one.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (isLoading || !periodData) {
    return <Skeleton className="h-48 rounded-2xl" />
  }

  const [recipient, deadline, , , , , participants] = periodData
  const isRecipient = sameAddress(recipient as string, address)

  const contribution = contributionData as {
    status: number
    paidAmount: bigint
    paidAt: bigint
    extensionDeadline: bigint
    extensionRequested: boolean
    extensionApproved: boolean
  } | null

  const deadlinePast = isExpired(deadline as bigint)
  // Grace period must have elapsed before finalization is allowed.
  // Read frequency from circleRaw to pick the correct grace duration.
  const circleFrequency = (frequency as unknown as number) as Frequency
  const graceExpiredNow = isGraceExpired(Number(deadline as bigint), circleFrequency)
  const canContribute = address && !isRecipient && contribution?.status === 0 && contribution?.paidAmount === 0n && !deadlinePast

  // Only show Finalize when the grace period has fully passed AND there are participants.
  const canFinalize = graceExpiredNow && !!participants && (participants as string[]).length > 0

  const handleContribute = async () => {
    setContributeTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'contribute',
        args: [cid, periodIndex],
      })
      setContributeTxState({ status: 'confirming', hash })
      // Poll for receipt
      const poll = setInterval(async () => {
        const res = await refetch()
        const updated = res.data?.[1]?.result as { status: number } | undefined
        if (updated && updated.status !== 0) {
          clearInterval(poll)
          setContributeTxState({ status: 'success', hash })
          toast.success('Contribution confirmed!')
        }
      }, 3000)
      setTimeout(() => clearInterval(poll), 60_000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setContributeTxState({ status: 'error', message: msg.includes('User rejected') ? 'You rejected the transaction.' : 'Contribution failed.' })
    }
  }

  const handleFinalize = async () => {
    setFinalizeTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'finalizePeriod',
        args: [cid],
      })
      setFinalizeTxState({ status: 'confirming', hash })
      setFinalizeTxState({ status: 'success', hash })
      toast.success('Period finalized!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setFinalizeTxState({ status: 'error', message: msg.includes('not all final deadlines') ? 'Not all contribution deadlines have passed yet.' : 'Finalization failed.' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Period #{Number(currentPeriod) + 1}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <p className="text-muted text-xs mb-1">Recipient</p>
            <div className="flex items-center gap-1 flex-wrap">
              <AddressDisplay address={recipient as string} chars={4} />
              {isRecipient && <span className="text-xs text-terra-400">(you)</span>}
            </div>
          </div>
          <div>
            <p className="text-muted text-xs mb-1">Contribution deadline</p>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-muted shrink-0" />
              <CountdownTimer deadline={deadline as bigint} />
            </div>
            <p className="text-xs text-muted mt-0.5">{formatDeadline(deadline as bigint)}</p>
            {deadlinePast && !graceExpiredNow && (
              <p className="text-xs text-amber-600 mt-0.5">
                Grace ends: {formatDeadline(BigInt(graceExpiry(Number(deadline as bigint), circleFrequency)))}
              </p>
            )}
          </div>
        </div>

        {contribution && (
          <div className="flex items-center justify-between py-2 border-t border-ivory-200">
            <span className="text-sm text-muted">Your contribution</span>
            <ContributionStatusBadge status={contribution.status} />
          </div>
        )}

        {canContribute && (
          <div className="pt-2">
            <p className="text-xs text-muted mb-3">
              Approve USDC and contribute <strong>{String(contributionAmount as bigint / 1_000_000n)} USDC</strong> for this period.
              Grace period: {circleFrequency === Frequency.DAILY ? '12 hours' : circleFrequency === Frequency.WEEKLY ? '3 days' : '10 days'} after the deadline.
            </p>
            <UsdcApproveAndAction
              amount={contributionAmount as bigint}
              actionLabel="Contribute"
              onAction={handleContribute}
              actionTxState={contributeTxState}
            />
          </div>
        )}

        {deadlinePast && !graceExpiredNow && (
          <div className="pt-2 rounded-xl bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">
              Contribution deadline passed. Waiting for grace period to expire before finalization is available.
            </p>
          </div>
        )}

        {canFinalize && (
          <div className="pt-2">
            <p className="text-xs text-muted mb-2">
              Grace period expired. This period can now be finalized.
            </p>
            <TxButton
              txState={finalizeTxState}
              onAction={handleFinalize}
              idleLabel="Finalize Period"
              variant="secondary"
              size="sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
