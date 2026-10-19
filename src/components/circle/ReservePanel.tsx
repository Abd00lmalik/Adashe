'use client'

import { useState } from 'react'
import { useReadContracts, useWriteContract } from 'wagmi'
import { adasheContract, CONTRACT_ABI, CircleStatus } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { TxButton, type TxState } from '@/components/tx/TxButton'
import { Skeleton } from '@/components/ui/skeleton'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

interface ReservePanelProps {
  cid: bigint
  address: string
}

export function ReservePanel({ cid, address }: ReservePanelProps) {
  const [txState, setTxState] = useState<TxState>({ status: 'idle' })

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'memberRecords', args: [cid, address as `0x${string}`] },
      { ...adasheContract, functionName: 'circles', args: [cid] },
    ],
    query: { staleTime: 15_000 },
  })

  const { writeContractAsync } = useWriteContract()

  if (isLoading) return <Skeleton className="h-24 rounded-2xl" />

  const memberRec = data?.[0]?.status === 'success'
    ? (data[0].result as [boolean, boolean, bigint, bigint, bigint, string])
    : null
  const circleRaw = data?.[1]?.status === 'success' ? data[1].result : null

  if (!memberRec || !circleRaw) return null

  const [, , reserveBalance] = memberRec
  const [, , , , , , , , , status] = circleRaw as [bigint, string, string, bigint, number, number, number, number, string, number, ...unknown[]]

  const isCompleted = (status as unknown as number) === CircleStatus.COMPLETED

  const handleRefund = async () => {
    setTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'claimReserveRefund',
        args: [cid],
      })
      setTxState({ status: 'confirming', hash })
      setTxState({ status: 'success', hash })
      toast.success('Reserve refunded!')
      await refetch()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setTxState({ status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Refund failed.' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-forest-400" />
          Reserve
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Your reserve balance</p>
            <UsdcAmount amount={reserveBalance as bigint} size="lg" className="mt-1" />
          </div>
        </div>

        <p className="text-xs text-muted text-pretty">
          Your reserve covers your contributions if you miss a deadline.
          It is withheld from your payout and returned at final settlement when the circle completes,
          provided you have no outstanding debt.
        </p>

        {isCompleted && (reserveBalance as bigint) > 0n && (
          <TxButton
            txState={txState}
            onAction={handleRefund}
            idleLabel="Claim Reserve Refund"
            variant="secondary"
          />
        )}
        {!isCompleted && (reserveBalance as bigint) > 0n && (
          <p className="text-xs text-muted">Reserve refund available when the circle completes.</p>
        )}
        {(reserveBalance as bigint) === 0n && (
          <p className="text-xs text-muted">No reserve balance.</p>
        )}
      </CardContent>
    </Card>
  )
}
