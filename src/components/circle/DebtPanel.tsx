'use client'

import { useState, useEffect } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
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
  const [repayTxStates, setRepayTxStates] = useState<Record<string, TxState>>({})
  const [repayReserveTxStates, setRepayReserveTxStates] = useState<Record<string, TxState>>({})
  const [repayHash, setRepayHash] = useState<`0x${string}` | undefined>()
  const [repayReserveHash, setRepayReserveHash] = useState<`0x${string}` | undefined>()
  const [pendingPeriod, setPendingPeriod] = useState<number | null>(null)
  const [pendingReservePeriod, setPendingReservePeriod] = useState<number | null>(null)

  const queryClient = useQueryClient()

  // Always call all hooks unconditionally — no early returns before hooks.
  const { data: memberData, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'memberRecords', args: [cid, address as `0x${string}`] },
      { ...adasheContract, functionName: 'circles', args: [cid] },
    ],
    query: { staleTime: 0, refetchOnMount: true },
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
    query: { enabled: debtBalance > 0n && memberCount > 0, staleTime: 0, refetchOnMount: true },
  })

  const { writeContractAsync } = useWriteContract()

  // Receipt watchers for repay and repayReserve
  const { isSuccess: repayConfirmed, isError: repayFailed } = useWaitForTransactionReceipt({
    hash: repayHash,
    query: { enabled: !!repayHash },
  })
  const { isSuccess: repayReserveConfirmed, isError: repayReserveFailed } = useWaitForTransactionReceipt({
    hash: repayReserveHash,
    query: { enabled: !!repayReserveHash },
  })

  useEffect(() => {
    if (repayConfirmed && repayHash && pendingPeriod !== null) {
      const key = String(pendingPeriod)
      setRepayTxStates((s) => ({ ...s, [key]: { status: 'success', hash: repayHash } }))
      toast.success('Debt repaid!')
      queryClient.invalidateQueries()
      refetch()
      refetchDebt()
      setRepayHash(undefined)
      setPendingPeriod(null)
    }
    if (repayFailed && repayHash && pendingPeriod !== null) {
      const key = String(pendingPeriod)
      setRepayTxStates((s) => ({ ...s, [key]: { status: 'error', message: 'Repayment failed.' } }))
      setRepayHash(undefined)
      setPendingPeriod(null)
    }
  }, [repayConfirmed, repayFailed, repayHash, pendingPeriod, queryClient, refetch, refetchDebt])

  useEffect(() => {
    if (repayReserveConfirmed && repayReserveHash && pendingReservePeriod !== null) {
      const key = String(pendingReservePeriod)
      setRepayReserveTxStates((s) => ({ ...s, [key]: { status: 'success', hash: repayReserveHash } }))
      toast.success('Reserve debt repaid! Your reserve has been restored.')
      queryClient.invalidateQueries()
      refetch()
      refetchDebt()
      setRepayReserveHash(undefined)
      setPendingReservePeriod(null)
    }
    if (repayReserveFailed && repayReserveHash && pendingReservePeriod !== null) {
      const key = String(pendingReservePeriod)
      setRepayReserveTxStates((s) => ({ ...s, [key]: { status: 'error', message: 'Repayment failed.' } }))
      setRepayReserveHash(undefined)
      setPendingReservePeriod(null)
    }
  }, [repayReserveConfirmed, repayReserveFailed, repayReserveHash, pendingReservePeriod, queryClient, refetch, refetchDebt])

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
    const key = String(periodIndex)
    setRepayTxStates((s) => ({ ...s, [key]: { status: 'signing' } }))
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'repayDebt',
        args: [cid, BigInt(periodIndex)],
      })
      setPendingPeriod(periodIndex)
      setRepayHash(hash)
      setRepayTxStates((s) => ({ ...s, [key]: { status: 'confirming', hash } }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setRepayTxStates((s) => ({
        ...s,
        [key]: { status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Repayment failed.' },
      }))
    }
  }

  const handleRepayReserve = async (periodIndex: number) => {
    const key = String(periodIndex)
    setRepayReserveTxStates((s) => ({ ...s, [key]: { status: 'signing' } }))
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'repayReserveDebt',
        args: [cid, BigInt(periodIndex)],
      })
      setPendingReservePeriod(periodIndex)
      setRepayReserveHash(hash)
      setRepayReserveTxStates((s) => ({ ...s, [key]: { status: 'confirming', hash } }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setRepayReserveTxStates((s) => ({
        ...s,
        [key]: { status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Repayment failed.' },
      }))
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
              const key = String(i)

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
                        actionTxState={repayTxStates[key] ?? { status: 'idle' }}
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
                        actionTxState={repayReserveTxStates[key] ?? { status: 'idle' }}
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
