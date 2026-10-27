'use client'

import { useState, useEffect } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { adasheContract, CONTRACT_ABI } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { UsdcApproveAndAction } from '@/components/tx/UsdcApproveAndAction'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { TxState } from '@/components/tx/TxButton'

interface DebtPanelProps {
  cid: bigint
  address: string
  /** Show reserve repayment section. Default false — only show on My Position tab. */
  showReserveRepayment?: boolean
}

export function DebtPanel({ cid, address, showReserveRepayment = false }: DebtPanelProps) {
  const [repayTxStates, setRepayTxStates] = useState<Record<string, TxState>>({})
  const [repayReserveTxStates, setRepayReserveTxStates] = useState<Record<string, TxState>>({})
  const [repayHash, setRepayHash] = useState<`0x${string}` | undefined>()
  const [repayReserveHash, setRepayReserveHash] = useState<`0x${string}` | undefined>()
  const [pendingPeriod, setPendingPeriod] = useState<number | null>(null)
  const [pendingReservePeriod, setPendingReservePeriod] = useState<number | null>(null)

  const queryClient = useQueryClient()

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
  const memberCount: number = circleRaw
    ? (circleRaw as [bigint, string, string, bigint, number, ...unknown[]])[4]
    : 0

  // Per-period debt breakdown — always build the contracts array, disable when not needed.
  const debtCheckContracts = Array.from({ length: memberCount }, (_, i) => [
    { ...adasheContract, functionName: 'getDebtByPeriod' as const, args: [cid, BigInt(i), address as `0x${string}`] },
    { ...adasheContract, functionName: 'getReserveDebtByPeriod' as const, args: [cid, BigInt(i), address as `0x${string}`] },
  ]).flat()

  const { data: debtData, isLoading: debtLoading, refetch: refetchDebt } = useReadContracts({
    contracts: debtCheckContracts,
    query: { enabled: memberCount > 0, staleTime: 0, refetchOnMount: true },
  })

  const { writeContractAsync } = useWriteContract()

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
      setRepayTxStates((s) => ({ ...s, [key]: { status: 'success', hash: repayHash! } }))
      toast.success('Debt repaid!')
      queryClient.invalidateQueries()
      refetch()
      refetchDebt()
      setRepayHash(undefined)
      setPendingPeriod(null)
    }
    if (repayFailed && pendingPeriod !== null) {
      const key = String(pendingPeriod)
      setRepayTxStates((s) => ({ ...s, [key]: { status: 'error', message: 'Repayment failed.' } }))
      setRepayHash(undefined)
      setPendingPeriod(null)
    }
  }, [repayConfirmed, repayFailed, repayHash, pendingPeriod, queryClient, refetch, refetchDebt])

  useEffect(() => {
    if (repayReserveConfirmed && repayReserveHash && pendingReservePeriod !== null) {
      const key = String(pendingReservePeriod)
      setRepayReserveTxStates((s) => ({ ...s, [key]: { status: 'success', hash: repayReserveHash! } }))
      toast.success('Reserve restored!')
      queryClient.invalidateQueries()
      refetch()
      refetchDebt()
      setRepayReserveHash(undefined)
      setPendingReservePeriod(null)
    }
    if (repayReserveFailed && pendingReservePeriod !== null) {
      const key = String(pendingReservePeriod)
      setRepayReserveTxStates((s) => ({ ...s, [key]: { status: 'error', message: 'Repayment failed.' } }))
      setRepayReserveHash(undefined)
      setPendingReservePeriod(null)
    }
  }, [repayReserveConfirmed, repayReserveFailed, repayReserveHash, pendingReservePeriod, queryClient, refetch, refetchDebt])

  // All hooks called — now safe to early-return.
  if (isLoading) return <Skeleton className="h-24 rounded-2xl" />
  if (!memberRec) return null

  // Compute creditor debt (blocks payout) and reserve debt (voluntary reserve restoration) separately.
  const periodEntries: Array<{ index: number; creditorDebt: bigint; reserveDebt: bigint }> = []
  let creditorDebtTotal = 0n
  let reserveDebtTotal = 0n

  if (!debtLoading && debtData && memberCount > 0) {
    for (let i = 0; i < memberCount; i++) {
      const creditorDebt = (debtData?.[i * 2]?.result as bigint | undefined) ?? 0n
      const reserveDebt = (debtData?.[i * 2 + 1]?.result as bigint | undefined) ?? 0n
      creditorDebtTotal += creditorDebt
      reserveDebtTotal += reserveDebt
      if (creditorDebt > 0n || reserveDebt > 0n) {
        periodEntries.push({ index: i, creditorDebt, reserveDebt })
      }
    }
  }

  const hasBlockingDebt = creditorDebtTotal > 0n
  const hasReserveDebt = reserveDebtTotal > 0n

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
    <div className="space-y-4">
      {/* ── Blocking debt (creditor debt) ── */}
      <Card>
        <CardHeader>
          <CardTitle className={hasBlockingDebt ? 'flex items-center gap-2 text-danger' : 'text-forest-500'}>
            {hasBlockingDebt && <AlertTriangle className="h-4 w-4" />}
            Debt
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasBlockingDebt ? (
            <p className="text-sm text-success flex items-center gap-1.5">
              ✓ No outstanding debt
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <p className="text-sm text-red-700 font-medium">
                  Total owed: <UsdcAmount amount={creditorDebtTotal} size="sm" className="text-red-700" />
                </p>
                <p className="text-xs text-red-600 mt-1 text-pretty">
                  This amount is owed to the period recipient because your contribution was not covered by your reserve.
                  Outstanding debt blocks your scheduled payout until repaid.
                </p>
              </div>

              <div className="space-y-3">
                {periodEntries
                  .filter((e) => e.creditorDebt > 0n)
                  .map((e) => {
                    const key = String(e.index)
                    return (
                      <div key={e.index} className="rounded-xl border border-ivory-300 p-4 space-y-2">
                        <p className="text-sm font-medium text-forest-500">Period {e.index + 1}</p>
                        <p className="text-xs text-muted">Owed to recipient</p>
                        <UsdcAmount amount={e.creditorDebt} size="sm" />
                        <UsdcApproveAndAction
                          amount={e.creditorDebt}
                          actionLabel="Repay"
                          onAction={() => handleRepay(e.index)}
                          actionTxState={repayTxStates[key] ?? { status: 'idle' }}
                        />
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Reserve restoration (optional, not blocking) — only shown on My Position tab ── */}
      {hasReserveDebt && showReserveRepayment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <ShieldCheck className="h-4 w-4" />
              Reserve Repayment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-sm text-amber-800 font-medium">
                Your reserve covered a missed contribution
              </p>
              <p className="text-xs text-amber-700 mt-1 text-pretty">
                Your individual reserve was used to cover your obligation in a previous period.
                Repaying this amount restores your reserve so it can protect you again in future periods.
                This does not affect your payout eligibility.
              </p>
            </div>

            <div className="space-y-3">
              {periodEntries
                .filter((e) => e.reserveDebt > 0n)
                .map((e) => {
                  const key = String(e.index)
                  return (
                    <div key={e.index} className="rounded-xl border border-amber-200 p-4 space-y-2">
                      <p className="text-sm font-medium text-amber-800">Period {e.index + 1}</p>
                      <p className="text-xs text-muted">Reserve used to cover missed contribution</p>
                      <UsdcAmount amount={e.reserveDebt} size="sm" />
                      <UsdcApproveAndAction
                        amount={e.reserveDebt}
                        actionLabel="Restore Reserve"
                        onAction={() => handleRepayReserve(e.index)}
                        actionTxState={repayReserveTxStates[key] ?? { status: 'idle' }}
                      />
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
