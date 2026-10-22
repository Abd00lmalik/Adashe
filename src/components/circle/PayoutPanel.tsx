'use client'

import { useState, useEffect } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { adasheContract, CONTRACT_ABI } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { TxButton, type TxState } from '@/components/tx/TxButton'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { sameAddress } from '@/lib/utils'

interface PayoutPanelProps {
  cid: bigint
  circleRaw: readonly unknown[]
  address: string
}

export function PayoutPanel({ cid, circleRaw, address }: PayoutPanelProps) {
  const [, , , , memberCount, , , , , , , currentPeriod] =
    circleRaw as [bigint, string, string, bigint, number, ...unknown[]]
  const [txState, setTxState] = useState<TxState>({ status: 'idle' })
  const [claimHash, setClaimHash] = useState<`0x${string}` | undefined>()
  const queryClient = useQueryClient()

  const periodContracts = Array.from({ length: memberCount as number }, (_, i) => ({
    ...adasheContract,
    functionName: 'getPeriod' as const,
    args: [cid, BigInt(i)],
  }))

  const { data: periodsData, isLoading, refetch } = useReadContracts({
    contracts: periodContracts,
    query: { staleTime: 0, refetchOnMount: true },
  })

  const { writeContractAsync } = useWriteContract()

  // Receipt watcher for the claim tx
  const { isSuccess: claimConfirmed, isError: claimFailed } = useWaitForTransactionReceipt({
    hash: claimHash,
    query: { enabled: !!claimHash },
  })

  useEffect(() => {
    if (claimConfirmed && claimHash) {
      setTxState({ status: 'success', hash: claimHash })
      toast.success('Payout claimed successfully!')
      queryClient.invalidateQueries()
      refetch()
      setClaimHash(undefined)
    }
    if (claimFailed && claimHash) {
      setTxState({ status: 'error', message: 'Claim transaction failed on-chain.' })
      setClaimHash(undefined)
    }
  }, [claimConfirmed, claimFailed, claimHash, queryClient, refetch])

  // getPeriod returns 9 values (v10):
  // [0] recipient: address
  // [1] deadline: uint256
  // [2] grossEntitlement: uint256
  // [3] payoutReleased: bool
  // [4] payoutWithheld: bool
  // [5] withheldAmount: uint256
  // [6] claimableAmount: uint256
  // [7] progressivelyPaid: uint256  ← added in v10
  // [8] participants: address[]
  const claimablePeriods = (periodsData ?? [])
    .map((pd, i) => {
      if (pd.status !== 'success') return null
      const result = pd.result as readonly unknown[]
      const recipient = result[0] as string
      const payoutReleased = result[3] as boolean
      const payoutWithheld = result[4] as boolean
      const withheldAmount = result[5] as bigint
      const claimableAmount = result[6] as bigint
      const progressivelyPaid = result[7] as bigint

      if (!sameAddress(recipient, address)) return null
      return { periodIndex: i, payoutReleased, payoutWithheld, withheldAmount, claimableAmount, progressivelyPaid }
    })
    .filter(Boolean)

  const handleClaim = async (periodIndex: number) => {
    setTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'claimPayout',
        args: [cid, BigInt(periodIndex)],
      })
      setClaimHash(hash)
      setTxState({ status: 'confirming', hash })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      const userMsg = msg.includes('debt outstanding')
        ? 'You have outstanding debt. Repay all debt before claiming your payout.'
        : msg.includes('no claimable payout')
        ? 'No claimable payout yet. The period may still be open or not yet finalized.'
        : msg.includes('User rejected')
        ? 'You rejected the transaction.'
        : `Claim failed: ${msg.slice(0, 120)}`
      setTxState({ status: 'error', message: userMsg })
    }
  }

  if (isLoading) return <Skeleton className="h-32 rounded-2xl" />

  // For a PENDING circle, currentPeriod might be undefined — show waiting state
  const activePeriods = claimablePeriods.filter(Boolean)

  if (!activePeriods.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Payout</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            {(currentPeriod as number) === 0
              ? 'The circle has not started yet. Payouts become available after the first period is finalized.'
              : 'You are not the recipient of any period, or all your payouts have already been claimed.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle>Payout</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {activePeriods.map((cp) => {
          if (!cp) return null
          const { periodIndex, payoutReleased, payoutWithheld, withheldAmount, claimableAmount, progressivelyPaid } = cp

          if (payoutReleased) {
            return (
              <div key={periodIndex} className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Period {periodIndex + 1} payout claimed
                {progressivelyPaid > 0n && (
                  <span className="text-xs text-muted ml-1">(incl. <UsdcAmount amount={progressivelyPaid} /> claimed progressively)</span>
                )}
              </div>
            )
          }

          if (payoutWithheld) {
            return (
              <div key={periodIndex} className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">Period {periodIndex + 1} payout withheld</p>
                    {withheldAmount > 0n && (
                      <p className="text-amber-700 text-xs mt-1">
                        Withheld: <UsdcAmount amount={withheldAmount} />
                      </p>
                    )}
                    <p className="text-amber-700 text-xs mt-1 text-pretty">
                      Your payout is held because you have outstanding debt.
                      Repay all debt to become eligible, or use the settlement function if the circle is completed.
                    </p>
                  </div>
                </div>
              </div>
            )
          }

          // All claimed progressively, period not yet finalized — no claim button needed
          if (claimableAmount === 0n && progressivelyPaid > 0n && !payoutWithheld) {
            return (
              <div key={periodIndex} className="flex items-start gap-2 rounded-xl bg-surface border p-4 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-forest">
                    Period {periodIndex + 1}: <UsdcAmount amount={progressivelyPaid} /> claimed progressively.
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Your reserve will be credited when the period is finalized.
                  </p>
                </div>
              </div>
            )
          }

          if (claimableAmount === 0n) {
            // Period still open, no progressive claims yet
            return (
              <div key={periodIndex} className="rounded-xl bg-surface border p-4 text-sm text-muted">
                <p>Period {periodIndex + 1}: waiting for the period to be finalized before your payout is available.</p>
              </div>
            )
          }

          // Claimable — show remaining amount and claim button
          return (
            <div key={periodIndex} className="space-y-3 rounded-xl bg-surface border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Period {periodIndex + 1} payout ready</p>
                <p className="text-sm font-semibold text-forest">
                  <UsdcAmount amount={claimableAmount} />
                </p>
              </div>
              {progressivelyPaid > 0n && (
                <p className="text-xs text-muted">
                  <UsdcAmount amount={progressivelyPaid} /> already claimed progressively.
                </p>
              )}
              <TxButton
                txState={txState}
                onAction={() => handleClaim(periodIndex)}
                idleLabel={`Claim ${String(claimableAmount / 1_000_000n)} USDC`}
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
