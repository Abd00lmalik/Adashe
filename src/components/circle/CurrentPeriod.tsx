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
import { Clock, Users, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface CurrentPeriodProps {
  cid: bigint
  circleRaw: readonly unknown[]
  address?: string
}

export function CurrentPeriod({ cid, circleRaw, address }: CurrentPeriodProps) {
  const [, , , contributionAmount, memberCount, , , , , status, , currentPeriod] = circleRaw as [
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
  const canContribute = address && !isRecipient && contribution?.status === 0 && contribution?.paidAmount === 0n && !deadlinePast

  const canFinalize = (() => {
    if (!deadlinePast) return false
    if (!participants) return false
    return (participants as string[]).every((p) => sameAddress(p, recipient as string) || true) // simplified; finalize checks deadlines onchain
  })()

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
        <CardTitle>Current Period — #{Number(currentPeriod) + 1}</CardTitle>
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
            <p className="text-muted text-xs mb-1">Deadline</p>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-muted shrink-0" />
              <CountdownTimer deadline={deadline as bigint} />
            </div>
            <p className="text-xs text-muted mt-0.5">{formatDeadline(deadline as bigint)}</p>
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
              A 10-day grace period applies after the deadline.
            </p>
            <UsdcApproveAndAction
              amount={contributionAmount as bigint}
              actionLabel="Contribute"
              onAction={handleContribute}
              actionTxState={contributeTxState}
            />
          </div>
        )}

        {deadlinePast && (
          <div className="pt-2">
            <p className="text-xs text-muted mb-2">
              The contribution deadline has passed. Anyone can finalize this period once all grace periods expire.
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
