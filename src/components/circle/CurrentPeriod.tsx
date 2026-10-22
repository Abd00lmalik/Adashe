'use client'

import { useState, useEffect } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
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
import { isGraceExpired, graceExpiry } from '@/lib/schedule'
import { Frequency } from '@/lib/contract'
import { Clock } from 'lucide-react'
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
  const reserveAmount = (circleRaw as unknown[])[12] as bigint

  const periodIndex = BigInt(currentPeriod as number)

  // Always include both contracts so data[0]=period and data[1]=contribution
  // are at stable indices regardless of whether address is defined yet.
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'getPeriod', args: [cid, periodIndex] },
      { ...adasheContract, functionName: 'getContribution', args: [cid, periodIndex, (address ?? ZERO_ADDR) as `0x${string}`] },
    ],
    query: { staleTime: 0, refetchOnMount: true },
  })

  const periodData = data?.[0]?.status === 'success'
    ? (data[0].result as [string, bigint, bigint, boolean, boolean, bigint, bigint, bigint, string[]])
    : null
  // data[1] is always at index 1 — no shifting based on address presence
  const contributionData = data?.[1]?.status === 'success' && address
    ? data[1].result
    : null

  // Read getContribution for every non-recipient participant so we can compute
  // the exact paidSoFar — the sum of all PAID/LATE_PAID contributions so far.
  // This is required to gate the progressive claim button on the actual available
  // amount rather than the theoretical maximum (grossEntitlement - reserveAmount).
  const periodParticipants = periodData ? (periodData[8] as string[]) : []
  const periodRecipient = periodData ? (periodData[0] as string) : ''
  const nonRecipientParticipants = periodParticipants.filter(
    (p) => !sameAddress(p, periodRecipient)
  )
  const { data: allContribData, refetch: refetchContribs } = useReadContracts({
    contracts: nonRecipientParticipants.map((participant) => ({
      ...adasheContract,
      functionName: 'getContribution' as const,
      args: [cid, periodIndex, participant as `0x${string}`],
    })),
    query: {
      staleTime: 0,
      refetchOnMount: true,
      enabled: nonRecipientParticipants.length > 0,
    },
  })

  // Sum contributions with status PAID (1) or LATE_PAID (2).
  const paidSoFar: bigint = (allContribData ?? []).reduce((sum, result) => {
    if (result?.status !== 'success') return sum
    const cr = result.result as { status: number; paidAmount: bigint }
    if (cr.status === 1 || cr.status === 2) return sum + cr.paidAmount
    return sum
  }, 0n)

  const [contributeTxState, setContributeTxState] = useState<TxState>({ status: 'idle' })
  const [finalizeTxState, setFinalizeTxState] = useState<TxState>({ status: 'idle' })
  const [progressiveTxState, setProgressiveTxState] = useState<TxState>({ status: 'idle' })

  // Optimistic local state: tracks the amount claimed progressively this session.
  // Used to hide the claim button immediately after a confirmed receipt, before the
  // query cache has refreshed with the new on-chain progressivelyPaid value.
  // Initialise to 0n; after a confirmed claim we set it to maxSpendable so the
  // button hides instantly. The next refetch overwrites periodData with real chain
  // data and this local override becomes a no-op.
  const [localProgressivelyClaimed, setLocalProgressivelyClaimed] = useState(0n)

  // Tx hashes for receipt watchers
  const [contributeHash, setContributeHash] = useState<`0x${string}` | undefined>()
  const [finalizeHash, setFinalizeHash] = useState<`0x${string}` | undefined>()
  const [progressiveHash, setProgressiveHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()

  // Receipt watchers — one per tx type
  const { isSuccess: contributeConfirmed, isError: contributeFailed } = useWaitForTransactionReceipt({
    hash: contributeHash,
    query: { enabled: !!contributeHash },
  })
  const { isSuccess: finalizeConfirmed, isError: finalizeFailed } = useWaitForTransactionReceipt({
    hash: finalizeHash,
    query: { enabled: !!finalizeHash },
  })
  const { isSuccess: progressiveConfirmed, isError: progressiveFailed } = useWaitForTransactionReceipt({
    hash: progressiveHash,
    query: { enabled: !!progressiveHash },
  })

  useEffect(() => {
    if (contributeConfirmed && contributeHash) {
      setContributeTxState({ status: 'success', hash: contributeHash })
      toast.success('Contribution confirmed!')
      queryClient.invalidateQueries()
      refetch()
      refetchContribs()
      setContributeHash(undefined)
    }
    if (contributeFailed && contributeHash) {
      setContributeTxState({ status: 'error', message: 'Contribution failed on-chain.' })
      setContributeHash(undefined)
    }
  }, [contributeConfirmed, contributeFailed, contributeHash, queryClient, refetch, refetchContribs])

  useEffect(() => {
    if (finalizeConfirmed && finalizeHash) {
      setFinalizeTxState({ status: 'success', hash: finalizeHash })
      toast.success('Period finalized!')
      queryClient.invalidateQueries()
      refetch()
      refetchContribs()
      setFinalizeHash(undefined)
    }
    if (finalizeFailed && finalizeHash) {
      setFinalizeTxState({ status: 'error', message: 'Not all contribution deadlines have passed yet.' })
      setFinalizeHash(undefined)
    }
  }, [finalizeConfirmed, finalizeFailed, finalizeHash, queryClient, refetch, refetchContribs])

  useEffect(() => {
    if (progressiveConfirmed && progressiveHash) {
      setProgressiveTxState({ status: 'success', hash: progressiveHash })
      toast.success('Progressive payout claimed!')
      // Optimistically advance localProgressivelyClaimed by exactly what was
      // just claimed (paidSoFar - reserveAmount - alreadyClaimed) so the button
      // hides immediately before the query cache refreshes with the new on-chain
      // progressivelyPaid value. Using paidSoFar (exact) not grossEntitlement
      // (upper bound) avoids showing 0 available when only some members have paid.
      setLocalProgressivelyClaimed((prev) => {
        const ps = paidSoFar          // exact sum of PAID/LATE_PAID so far
        const ra = reserveAmount
        const exactSpendable = ps > ra ? ps - ra : 0n
        const newTotal = exactSpendable > prev ? exactSpendable : prev
        return newTotal
      })
      queryClient.invalidateQueries()
      refetch()
      refetchContribs()
      setProgressiveHash(undefined)
    }
    if (progressiveFailed && progressiveHash) {
      setProgressiveTxState({ status: 'error', message: 'No additional funds available to claim yet.' })
      setProgressiveHash(undefined)
    }
  }, [progressiveConfirmed, progressiveFailed, progressiveHash, queryClient, refetch, refetchContribs, paidSoFar, reserveAmount])

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

  // 9-element tuple: [recipient, deadline, grossEntitlement, released, withheld, withheldAmt, claimableAmt, progressivelyPaid, participants]
  // grossEntitlement (index 2) is no longer used for button gating — paidSoFar is used instead.
  const [recipient, deadline, , payoutReleased, , , , progressivelyPaid, participants] = periodData
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
  const circleFrequency = (frequency as unknown as number) as Frequency
  const graceExpiredNow = isGraceExpired(Number(deadline as bigint), circleFrequency)

  const hasPaid = contributionData !== null && contribution !== null &&
    (contribution.status !== 0 || (contribution.paidAmount ?? 0n) > 0n)
  const canContribute = !!address && !isRecipient && !deadlinePast && contributionData !== null && !hasPaid

  const canFinalize = graceExpiredNow && !!participants && (participants as string[]).length > 0

  // Progressive payout availability — exact computation using real paidSoFar:
  //   exactSpendable  = max(0, paidSoFar - reserveAmount)
  //   exactAvailableNow = max(0, exactSpendable - effectiveProgressivelyClaimed)
  // effectiveProgressivelyClaimed is the larger of the on-chain progressivelyPaid
  // and the local optimistic value set immediately after a confirmed claim receipt,
  // so the button hides the moment the receipt lands without waiting for a refetch.
  const chainProgressivelyPaid = progressivelyPaid as bigint
  const effectiveProgressivelyClaimed = chainProgressivelyPaid > localProgressivelyClaimed
    ? chainProgressivelyPaid
    : localProgressivelyClaimed
  const alreadyProgressivelyClaimed = effectiveProgressivelyClaimed
  const exactSpendable = paidSoFar > reserveAmount ? paidSoFar - reserveAmount : 0n
  const exactAvailableNow = exactSpendable > effectiveProgressivelyClaimed
    ? exactSpendable - effectiveProgressivelyClaimed
    : 0n
  // Show button only when: recipient, period not finalized, and real funds are available
  const canClaimProgressively = isRecipient && !(payoutReleased as boolean) && exactAvailableNow > 0n

  const handleContribute = async () => {
    setContributeTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'contribute',
        args: [cid, periodIndex],
      })
      setContributeHash(hash)
      setContributeTxState({ status: 'confirming', hash })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setContributeTxState({
        status: 'error',
        message: msg.includes('User rejected')
          ? 'You rejected the transaction.'
          : msg.includes('already settled')
          ? 'You have already contributed this period.'
          : 'Contribution failed.',
      })
    }
  }

  const handleProgressiveClaim = async () => {
    setProgressiveTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'claimProgressivePayout',
        args: [cid, periodIndex],
      })
      setProgressiveHash(hash)
      setProgressiveTxState({ status: 'confirming', hash })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setProgressiveTxState({
        status: 'error',
        message: msg.includes('debt outstanding')
          ? 'You have outstanding debt that must be repaid before claiming.'
          : msg.includes('nothing new to claim')
          ? 'No additional funds are available to claim yet.'
          : 'Claim failed.',
      })
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
      setFinalizeHash(hash)
      setFinalizeTxState({ status: 'confirming', hash })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setFinalizeTxState({
        status: 'error',
        message: msg.includes('not all final deadlines')
          ? 'Not all contribution deadlines have passed yet.'
          : 'Finalization failed.',
      })
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
              Approve USDC and contribute <strong>{String((contributionAmount as bigint) / 1_000_000n)} USDC</strong> for this period.
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

        {/* Progressive payout claim — only shown when there is genuinely spendable entitlement remaining */}
        {canClaimProgressively && (
          <div className="pt-2 border-t border-ivory-200">
            <p className="text-xs text-muted mb-1 font-medium">Progressive payout</p>
            <p className="text-xs text-muted mb-3">
              Claim contributions already received above the <UsdcAmount amount={reserveAmount} /> reserve threshold.
              The reserve is held until period finalization.
              {alreadyProgressivelyClaimed > 0n && (
                <> Already claimed: <UsdcAmount amount={alreadyProgressivelyClaimed} />.</>
              )}
            </p>
            <TxButton
              txState={progressiveTxState}
              onAction={handleProgressiveClaim}
              idleLabel="Claim Available Payout"
              variant="default"
              size="sm"
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
