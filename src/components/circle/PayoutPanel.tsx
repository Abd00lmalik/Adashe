'use client'

import { useState } from 'react'
import { useReadContracts, useWriteContract } from 'wagmi'
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
  const [, , , , memberCount, , , , , , , currentPeriod] = circleRaw as [bigint, string, string, bigint, number, ...unknown[]]
  const [txState, setTxState] = useState<TxState>({ status: 'idle' })

  // Check all periods for claimable payouts for this address
  const periodContracts = Array.from({ length: memberCount as number }, (_, i) => ({
    ...adasheContract,
    functionName: 'getPeriod' as const,
    args: [cid, BigInt(i)],
  }))

  const { data: periodsData, isLoading, refetch } = useReadContracts({
    contracts: periodContracts,
    query: { staleTime: 15_000 },
  })

  const { writeContractAsync } = useWriteContract()

  // Find periods where this address is recipient and payout is claimable
  const claimablePeriods = (periodsData ?? [])
    .map((pd, i) => {
      if (pd.status !== 'success') return null
      const [recipient, , , payoutReleased, payoutWithheld, , claimableAmount] =
        pd.result as [string, bigint, bigint, boolean, boolean, bigint, ...unknown[]]
      // getPeriod returns (recipient, deadline, grossEntitlement, payoutReleased, payoutWithheld, withheldAmount, participants)
      // but claimableAmount is NOT returned by getPeriod — we'll use withheldAmount as proxy
      if (!sameAddress(recipient as string, address)) return null
      return { periodIndex: i, payoutReleased, payoutWithheld }
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
      setTxState({ status: 'confirming', hash })
      setTxState({ status: 'success', hash })
      toast.success('Payout claimed!')
      await refetch()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      const userMsg = msg.includes('debt outstanding')
        ? 'You have outstanding debt. Repay all debt before claiming your payout.'
        : msg.includes('User rejected')
        ? 'You rejected the transaction.'
        : 'Claim failed.'
      setTxState({ status: 'error', message: userMsg })
    }
  }

  if (isLoading) return <Skeleton className="h-32 rounded-2xl" />

  if (!claimablePeriods.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Payout</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted">You are not the recipient of any period, or payouts have already been claimed.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle>Payout</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {claimablePeriods.map((cp) => {
          if (!cp) return null
          const { periodIndex, payoutReleased, payoutWithheld } = cp

          if (payoutReleased) {
            return (
              <div key={periodIndex} className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Period {periodIndex + 1} payout claimed
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
                    <p className="text-amber-700 text-xs mt-1 text-pretty">
                      Your payout is held because you have outstanding debt. 
                      Repay all debt to become eligible, or use the settlement function if the circle is completed.
                    </p>
                  </div>
                </div>
              </div>
            )
          }

          // Claimable
          return (
            <div key={periodIndex} className="space-y-3">
              <p className="text-sm text-muted">Period {periodIndex + 1} — your payout is ready to claim.</p>
              <TxButton
                txState={txState}
                onAction={() => handleClaim(periodIndex)}
                idleLabel="Claim Payout"
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
