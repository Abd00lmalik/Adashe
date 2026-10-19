'use client'

import { useState } from 'react'
import { useReadContracts, useWriteContract } from 'wagmi'
import { adasheContract, CONTRACT_ABI } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { UsdcApproveAndAction } from '@/components/tx/UsdcApproveAndAction'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { TxState } from '@/components/tx/TxButton'

interface DebtPanelProps {
  cid: bigint
  address: string
}

export function DebtPanel({ cid, address }: DebtPanelProps) {
  const [repayTxState, setRepayTxState] = useState<TxState>({ status: 'idle' })
  const [repayReserveTxState, setRepayReserveTxState] = useState<TxState>({ status: 'idle' })

  // Always call both hooks unconditionally — no early returns before hooks.
  const { data: memberData, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'memberRecords', args: [cid, address as `0x${string}`] },
      { ...adasheContract, functionName: 'circles', args: [cid] },
    ],
    query: { staleTime: 15_000 },
  })

  const memberRec = memberData?.[0]?.status === 'success'
    ? (memberData[0].result as [boolean, boolean, bigint, bigint, bigint, string])
    : null
  const circleRaw = memberData?.[1]?.status === 'success' ? memberData[1].result : null
  const debtBalance: bigint = memberRec ? (memberRec[3] as bigint) : 0n
  const memberCount: number = circleRaw
    ? (circleRaw as [bigint, string, string, bigint, number, ...unknown[]])[4]
    : 0

  // Build the per-period debt check contracts — always computed, may be empty array.
  const debtCheckContracts = Array.from({ length: memberCount }, (_, i) => [
    { ...adasheContract, functionName: 'getDebtByPeriod' as const, args: [cid, BigInt(i), address as `0x${string}`] },
    { ...adasheContract, functionName: 'getReserveDebtByPeriod' as const, args: [cid, BigInt(i), address as `0x${string}`] },
  ]).flat()

  // Hook always called — disabled when no debt or memberCount not yet known.
  const { data: debtData, isLoading: debtLoading, refetch: refetchDebt } = useReadContracts({
    contracts: debtCheckContracts,
    query: { enabled: debtBalance > 0n && memberCount > 0, staleTime: 15_000 },
  })

  const { writeContractAsync } = useWriteContract()

  // Now early returns are safe — all hooks have been called.
  if (isLoading) return <Skeleton className="h-24 rounded-2xl" />
  if (!memberRec) return null

  if (debtBalance === 0n) {
    return (
      <Card>
        <CardHeader><CardTitle>Debt</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-success flex items-center gap-1.5">
            ✓ No outstanding debt
          </p>
        </CardContent>
      </Card>
    )
  }

  const handleRepay = async (periodIndex: number) => {
    setRepayTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'repayDebt',
        args: [cid, BigInt(periodIndex)],
      })
      setRepayTxState({ status: 'confirming', hash })
      setRepayTxState({ status: 'success', hash })
      toast.success('Debt repaid!')
      await refetch()
      await refetchDebt()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setRepayTxState({ status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Repayment failed.' })
    }
  }

  const handleRepayReserve = async (periodIndex: number) => {
    setRepayReserveTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'repayReserveDebt',
        args: [cid, BigInt(periodIndex)],
      })
      setRepayReserveTxState({ status: 'confirming', hash })
      setRepayReserveTxState({ status: 'success', hash })
      toast.success('Reserve debt repaid! Your reserve has been restored.')
      await refetch()
      await refetchDebt()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setRepayReserveTxState({ status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Repayment failed.' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-danger">
          <AlertTriangle className="h-4 w-4" />
          Outstanding Debt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700 font-medium">
            Total debt: <UsdcAmount amount={debtBalance} size="sm" className="text-red-700" />
          </p>
          <p className="text-xs text-red-600 mt-1 text-pretty">
            Any outstanding debt blocks your scheduled payout entirely.
            Repay all debt to restore eligibility.
          </p>
        </div>

        {!debtLoading && debtData && memberCount > 0 && (
          <div className="space-y-3">
            {Array.from({ length: memberCount }, (_, i) => {
              const creditorDebt = debtData?.[i * 2]?.result as bigint ?? 0n
              const reserveDebt = debtData?.[i * 2 + 1]?.result as bigint ?? 0n
              if (creditorDebt === 0n && reserveDebt === 0n) return null

              return (
                <div key={i} className="rounded-xl border border-ivory-300 p-4 space-y-3">
                  <p className="text-sm font-medium text-forest-500">Period {i + 1}</p>
                  {creditorDebt > 0n && (
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-muted">Creditor debt (owed to recipient)</p>
                        <UsdcAmount amount={creditorDebt} size="sm" />
                      </div>
                      <UsdcApproveAndAction
                        amount={creditorDebt}
                        actionLabel="Repay"
                        onAction={() => handleRepay(i)}
                        actionTxState={repayTxState}
                      />
                    </div>
                  )}
                  {reserveDebt > 0n && (
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-muted">Reserve debt (restore your reserve)</p>
                        <UsdcAmount amount={reserveDebt} size="sm" />
                      </div>
                      <UsdcApproveAndAction
                        amount={reserveDebt}
                        actionLabel="Repay Reserve"
                        onAction={() => handleRepayReserve(i)}
                        actionTxState={repayReserveTxState}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
