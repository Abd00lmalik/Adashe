'use client'

import { useState } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { adasheContract, CONTRACT_ABI, CircleStatus } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { TxButton, type TxState } from '@/components/tx/TxButton'
import { Skeleton } from '@/components/ui/skeleton'
import { ShieldCheck, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { sameAddress } from '@/lib/utils'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface ReservePanelProps {
  cid: bigint
  address: string
}

export function ReservePanel({ cid, address }: ReservePanelProps) {
  const [txState, setTxState] = useState<TxState>({ status: 'idle' })
  const [refundHash, setRefundHash] = useState<`0x${string}` | undefined>()
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'memberRecords', args: [cid, address as `0x${string}`] },
      { ...adasheContract, functionName: 'circles', args: [cid] },
    ],
    // Always read fresh — reserveBalance is credited at finalizePeriod so stale
    // data would show 0 immediately after a period is finalized.
    query: { staleTime: 0, refetchOnMount: true },
  })

  const { writeContractAsync } = useWriteContract()

  const { isSuccess: refundConfirmed, isError: refundFailed } = useWaitForTransactionReceipt({
    hash: refundHash,
    query: { enabled: !!refundHash },
  })

  useEffect(() => {
    if (refundConfirmed && refundHash) {
      setTxState({ status: 'success', hash: refundHash })
      toast.success('Reserve refunded!')
      queryClient.invalidateQueries()
      refetch()
      setRefundHash(undefined)
    }
    if (refundFailed && refundHash) {
      setTxState({ status: 'error', message: 'Refund failed.' })
      setRefundHash(undefined)
    }
  }, [refundConfirmed, refundFailed, refundHash, queryClient, refetch])

  if (isLoading) return <Skeleton className="h-24 rounded-2xl" />

  const memberRec = data?.[0]?.status === 'success'
    ? (data[0].result as [boolean, boolean, bigint, bigint, bigint, string])
    : null
  const circleRawData = data?.[1]?.status === 'success' ? data[1].result : null

  if (!memberRec || !circleRawData) return null

  const [, , reserveBalance] = memberRec
  const circleArr = circleRawData as [bigint, string, string, bigint, number, number, number, number, string, number, bigint, number, bigint, bigint]
  const status = circleArr[9] as unknown as number
  const currentPeriod = circleArr[11] as number
  const reserveAmount = circleArr[12] as bigint

  const isCompleted = status === CircleStatus.COMPLETED

  const handleRefund = async () => {
    setTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'claimReserveRefund',
        args: [cid],
      })
      setRefundHash(hash)
      setTxState({ status: 'confirming', hash })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setTxState({ status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Refund failed.' })
    }
  }

  return (
    <ReservePanelWithPeriod
      cid={cid}
      address={address}
      reserveBalance={reserveBalance as bigint}
      reserveAmount={reserveAmount}
      currentPeriod={currentPeriod}
      isCompleted={isCompleted}
      txState={txState}
      onRefund={handleRefund}
    />
  )
}

// Inner component: reads the current period to determine pending reserve credit.
interface ReservePanelWithPeriodProps {
  cid: bigint
  address: string
  reserveBalance: bigint
  reserveAmount: bigint
  currentPeriod: number
  isCompleted: boolean
  txState: TxState
  onRefund: () => void
}

function ReservePanelWithPeriod({
  cid,
  address,
  reserveBalance,
  reserveAmount,
  currentPeriod,
  isCompleted,
  txState,
  onRefund,
}: ReservePanelWithPeriodProps) {
  // Read the current period to check if this wallet is the recipient and the period is still open.
  // This tells us whether the reserve is "pending" (earmarked in the contract but not yet credited).
  const { data: periodData } = useReadContracts({
    contracts: [
      {
        ...adasheContract,
        functionName: 'getPeriod',
        args: [cid, BigInt(currentPeriod)],
      },
    ],
    query: { staleTime: 0, refetchOnMount: true, enabled: !isCompleted },
  })

  // getPeriod returns 9 values:
  // [0] recipient, [1] deadline, [2] grossEntitlement, [3] payoutReleased,
  // [4] payoutWithheld, [5] withheldAmount, [6] claimableAmount,
  // [7] progressivelyPaid, [8] participants
  const period = periodData?.[0]?.status === 'success'
    ? (periodData[0].result as [string, bigint, bigint, boolean, boolean, bigint, bigint, bigint, string[]])
    : null

  const isCurrentRecipient = period ? sameAddress(period[0], address) : false
  const periodReleased = period ? period[3] : true
  // The reserve is pending (held in contract, not yet in reserveBalance) when:
  // - the circle is active (not completed)
  // - this wallet is the current period's recipient
  // - the period has not been finalized yet (payoutReleased = false)
  const reservePending = !isCompleted && isCurrentRecipient && !periodReleased

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
            <UsdcAmount amount={reserveBalance} size="lg" className="mt-1" />
          </div>
        </div>

        {/* Pending reserve — shown while this member is the current recipient and period is open */}
        {reservePending && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-800">
                  Pending reserve: <UsdcAmount amount={reserveAmount} size="sm" />
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  The first contribution received this period is earmarked as your reserve.
                  It is held in the contract and will be credited to your reserve balance
                  when this period is finalized.
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted text-pretty">
          Your reserve covers your contributions if you miss a deadline.
          It is withheld from your payout and returned at final settlement when the circle completes,
          provided you have no outstanding debt.
        </p>

        {isCompleted && reserveBalance > 0n && (
          <TxButton
            txState={txState}
            onAction={onRefund}
            idleLabel="Claim Reserve Refund"
            variant="secondary"
          />
        )}
        {!isCompleted && reserveBalance > 0n && (
          <p className="text-xs text-muted">Reserve refund available when the circle completes.</p>
        )}
        {reserveBalance === 0n && !reservePending && (
          <p className="text-xs text-muted">No reserve balance yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
