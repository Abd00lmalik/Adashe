'use client'

import { useState, useEffect } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { adasheContract, CONTRACT_ABI, CircleStatus, ContributionStatus } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { TxButton, type TxState } from '@/components/tx/TxButton'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { sameAddress } from '@/lib/utils'

interface ContributionRefundPanelProps {
  cid: bigint
  circleRaw: readonly unknown[]
  address: string
}

/**
 * Shown on My Position when the circle is COMPLETED and there are periods where:
 * - The recipient's payout was withheld (they had debt and never paid)
 * - The connected wallet is a contributor (not the recipient) to that period
 * - The connected wallet has not yet claimed their contribution refund
 *
 * Allows the contributor to recover their contribution via claimContributionRefund.
 */
export function ContributionRefundPanel({ cid, circleRaw, address }: ContributionRefundPanelProps) {
  const [, , , , memberCount, , , , , circleStatus] =
    circleRaw as [bigint, string, string, bigint, number, ...unknown[]]
  const [txState, setTxState] = useState<TxState>({ status: 'idle' })
  const [refundHash, setRefundHash] = useState<`0x${string}` | undefined>()
  const queryClient = useQueryClient()

  // Only relevant when circle is COMPLETED
  const isCompleted = Number(circleStatus) === CircleStatus.COMPLETED

  const numPeriods = memberCount as number

  // Read all periods
  const { data: periodsData, isLoading: periodsLoading, refetch: refetchPeriods } = useReadContracts({
    contracts: Array.from({ length: numPeriods }, (_, i) => ({
      ...adasheContract,
      functionName: 'getPeriod' as const,
      args: [cid, BigInt(i)],
    })),
    query: { staleTime: 0, refetchOnMount: true, enabled: isCompleted },
  })

  // Find withheld-and-unreleased periods where the connected wallet is NOT the recipient
  const withheldPeriods = (periodsData ?? [])
    .map((pd, i) => {
      if (pd.status !== 'success') return null
      const result = pd.result as readonly unknown[]
      const recipient = result[0] as string
      const payoutReleased = result[3] as boolean
      const payoutWithheld = result[4] as boolean
      if (!payoutWithheld || payoutReleased) return null
      if (sameAddress(recipient, address)) return null // recipient uses settleOwnDebt
      return { periodIndex: i }
    })
    .filter(Boolean) as { periodIndex: number }[]

  // For each withheld period, read the caller's contribution record + hasClaimedRefund
  const refundContracts = withheldPeriods.flatMap(({ periodIndex }) => [
    {
      ...adasheContract,
      functionName: 'getContribution' as const,
      args: [cid, BigInt(periodIndex), address as `0x${string}`],
    },
    {
      ...adasheContract,
      functionName: 'hasClaimedContributionRefund' as const,
      args: [cid, BigInt(periodIndex), address as `0x${string}`],
    },
  ])

  const { data: refundData, isLoading: refundLoading, refetch: refetchRefunds } = useReadContracts({
    contracts: refundContracts,
    query: { staleTime: 0, refetchOnMount: true, enabled: withheldPeriods.length > 0 },
  })

  const { writeContractAsync } = useWriteContract()

  const { isSuccess: refundConfirmed, isError: refundFailed } = useWaitForTransactionReceipt({
    hash: refundHash,
    query: { enabled: !!refundHash },
  })

  useEffect(() => {
    if (refundConfirmed && refundHash) {
      setTxState({ status: 'success', hash: refundHash })
      toast.success('Contribution refund claimed successfully!')
      queryClient.invalidateQueries()
      refetchPeriods()
      refetchRefunds()
      setRefundHash(undefined)
    }
    if (refundFailed && refundHash) {
      setTxState({ status: 'error', message: 'Refund transaction failed on-chain.' })
      setRefundHash(undefined)
    }
  }, [refundConfirmed, refundFailed, refundHash, queryClient, refetchPeriods, refetchRefunds])

  const handleRefund = async (periodIndex: number) => {
    setTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'claimContributionRefund',
        args: [cid, BigInt(periodIndex)],
      })
      setRefundHash(hash)
      setTxState({ status: 'confirming', hash })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      const userMsg = msg.includes('refund already claimed')
        ? 'You have already claimed your refund for this period.'
        : msg.includes('no paid contribution found')
        ? 'No paid contribution found for this period.'
        : msg.includes('User rejected')
        ? 'You rejected the transaction.'
        : `Refund failed: ${msg.slice(0, 120)}`
      setTxState({ status: 'error', message: userMsg })
    }
  }

  if (!isCompleted || withheldPeriods.length === 0) return null
  if (periodsLoading || refundLoading) return <Skeleton className="h-24 rounded-2xl" />

  // Build refundable entries
  const entries = withheldPeriods.map(({ periodIndex }, idx) => {
    const crResult = refundData?.[idx * 2]
    const claimedResult = refundData?.[idx * 2 + 1]
    if (crResult?.status !== 'success') return null

    const cr = crResult.result as { status: number; paidAmount: bigint }
    const hasClaimed = claimedResult?.status === 'success' ? (claimedResult.result as boolean) : false

    const isPaid =
      cr.status === ContributionStatus.PAID ||
      cr.status === ContributionStatus.LATE_PAID ||
      cr.status === ContributionStatus.COVERED_BY_RESERVE

    if (!isPaid || cr.paidAmount === 0n) return null

    return { periodIndex, paidAmount: cr.paidAmount, hasClaimed }
  }).filter(Boolean) as { periodIndex: number; paidAmount: bigint; hasClaimed: boolean }[]

  if (entries.length === 0) return null

  const anyRefundable = entries.some(e => !e.hasClaimed)
  if (!anyRefundable) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Contribution Refunds Available
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted">
          The circle has completed, but the following period recipients never cleared
          their debt and their payouts remain withheld. You can reclaim your contribution
          for each period below.
        </p>
        {entries.map((entry) => {
          if (!entry) return null
          const { periodIndex, paidAmount, hasClaimed } = entry

          if (hasClaimed) {
            return (
              <div key={periodIndex} className="flex items-center gap-2 text-sm text-muted">
                <span className="text-success">✓</span>
                Period {periodIndex + 1}: <UsdcAmount amount={paidAmount} /> refund already claimed.
              </div>
            )
          }

          return (
            <div key={periodIndex} className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-amber-900">
                  Period {periodIndex + 1} — Your contribution
                </p>
                <p className="text-sm font-semibold text-amber-900">
                  <UsdcAmount amount={paidAmount} />
                </p>
              </div>
              <p className="text-xs text-amber-700 text-pretty">
                The recipient for this period never cleared their outstanding debt, so their
                payout remains withheld. You can recover the {' '}
                <UsdcAmount amount={paidAmount} className="text-amber-700" /> you contributed.
              </p>
              <TxButton
                txState={txState}
                onAction={() => handleRefund(periodIndex)}
                idleLabel={`Claim ${String(paidAmount / 1_000_000n)} USDC refund`}
                size="sm"
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
