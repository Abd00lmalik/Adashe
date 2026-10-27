'use client'

import { useReadContracts } from 'wagmi'
import { adasheContract } from '@/lib/contract'
import { AddressDisplay } from '@/components/ui/AddressDisplay'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { sameAddress } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

interface MembersListProps {
  cid: bigint
  circleRaw: readonly unknown[]
  currentAddress?: string
}

export function MembersList({ cid, circleRaw, currentAddress }: MembersListProps) {
  const [, creator, , , memberCount] = circleRaw as [bigint, string, string, bigint, number, ...unknown[]]
  const periodCount = memberCount as number

  const { data: payoutOrderData } = useReadContracts({
    contracts: [{ ...adasheContract, functionName: 'getPayoutOrder', args: [cid] }],
  })

  const payoutOrder = (payoutOrderData?.[0]?.status === 'success'
    ? (payoutOrderData[0].result as string[])
    : [])

  // Read memberRecords for each member
  const memberRecordContracts = payoutOrder.map((addr) => ({
    ...adasheContract,
    functionName: 'memberRecords' as const,
    args: [cid, addr as `0x${string}`],
  }))

  const { data: memberData, isLoading } = useReadContracts({
    contracts: memberRecordContracts,
    query: { enabled: payoutOrder.length > 0, staleTime: 0, refetchOnMount: true },
  })

  // Read getDebtByPeriod for each member × each period to get creditor-only debt
  // Layout: [member0_period0, member0_period1, ..., member1_period0, ...]
  const debtByPeriodContracts = payoutOrder.flatMap((addr) =>
    Array.from({ length: periodCount }, (_, pi) => ({
      ...adasheContract,
      functionName: 'getDebtByPeriod' as const,
      args: [cid, BigInt(pi), addr as `0x${string}`],
    }))
  )

  const { data: debtByPeriodData } = useReadContracts({
    contracts: debtByPeriodContracts,
    query: { enabled: payoutOrder.length > 0 && periodCount > 0, staleTime: 0 },
  })

  // Sum creditor debt per member
  const creditorDebtByMember: bigint[] = payoutOrder.map((_, mi) => {
    let total = 0n
    for (let pi = 0; pi < periodCount; pi++) {
      const idx = mi * periodCount + pi
      const result = debtByPeriodData?.[idx]
      if (result?.status === 'success') {
        total += result.result as bigint
      }
    }
    return total
  })

  if (isLoading || !payoutOrder.length) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    )
  }

  return (
    <>
      {/* Mobile: card list (hidden on sm+) */}
      <div className="sm:hidden space-y-3">
        {payoutOrder.map((addr, i) => {
          const rec = memberData?.[i]?.status === 'success'
            ? (memberData[i].result as [boolean, boolean, bigint, bigint, bigint, string])
            : null
          // memberRecords: (approved, joined, reserveBalance, debtBalance, positionPlusOne, removedAt)
          const approved       = rec?.[0] ?? false
          const joined         = rec?.[1] ?? false
          const reserveBalance = rec?.[2] ?? 0n
          const removedAt      = rec?.[5] ?? ''
          const isCreatorAddr  = sameAddress(addr, creator as string)
          const isSelf         = sameAddress(addr, currentAddress)
          const isRemoved      = typeof removedAt === 'bigint' ? removedAt > 0n : false
          // Only show creditor debt (not reserve-repayment debt)
          const creditorDebt   = creditorDebtByMember[i] ?? 0n
          const hasCreditorDebt = creditorDebt > 0n

          return (
            <div
              key={addr}
              className={`card p-4 space-y-3 ${isSelf ? 'ring-1 ring-terra-400/30' : ''}`}
            >
              {/* Header row: position + badges */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-muted shrink-0">#{i + 1}</span>
                  <AddressDisplay address={addr} chars={4} showExplorer={false} />
                  {isSelf && <span className="text-xs text-terra-400 shrink-0">(you)</span>}
                </div>
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  {isCreatorAddr && <Badge variant="terra">Creator</Badge>}
                  {approved && !isRemoved && <Badge variant="active">Active</Badge>}
                  {joined && !approved && <Badge variant="pending">Pending</Badge>}
                  {isRemoved && <Badge variant="danger">Removed</Badge>}
                </div>
              </div>

              {/* Reserve + Debt row */}
              <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-ivory-200">
                <div>
                  <p className="text-xs text-muted mb-0.5">Reserve</p>
                  <UsdcAmount amount={reserveBalance as bigint} size="sm" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted mb-0.5">Debt</p>
                  {hasCreditorDebt ? (
                    <span className="flex items-center gap-1 text-danger">
                      <AlertTriangle className="h-3 w-3" />
                      <UsdcAmount amount={creditorDebt} size="sm" className="text-danger" />
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: table (hidden below sm) */}
      <div className="hidden sm:block card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ivory-300">
                <th className="text-left px-5 py-3 text-muted font-medium text-xs whitespace-nowrap">#</th>
                <th className="text-left px-5 py-3 text-muted font-medium text-xs whitespace-nowrap">Address</th>
                <th className="text-left px-5 py-3 text-muted font-medium text-xs whitespace-nowrap">Role</th>
                <th className="text-right px-5 py-3 text-muted font-medium text-xs whitespace-nowrap">Reserve</th>
                <th className="text-right px-5 py-3 text-muted font-medium text-xs whitespace-nowrap">Debt</th>
              </tr>
            </thead>
            <tbody>
              {payoutOrder.map((addr, i) => {
                const rec = memberData?.[i]?.status === 'success'
                  ? (memberData[i].result as [boolean, boolean, bigint, bigint, bigint, string])
                  : null
                const approved       = rec?.[0] ?? false
                const joined         = rec?.[1] ?? false
                const reserveBalance = rec?.[2] ?? 0n
                const removedAt      = rec?.[5] ?? ''
                const isCreatorAddr  = sameAddress(addr, creator as string)
                const isSelf         = sameAddress(addr, currentAddress)
                const isRemoved      = typeof removedAt === 'bigint' ? removedAt > 0n : false
                const creditorDebt   = creditorDebtByMember[i] ?? 0n
                const hasCreditorDebt = creditorDebt > 0n

                return (
                  <tr
                    key={addr}
                    className={`border-b border-ivory-200 last:border-0 ${isSelf ? 'bg-terra-50/40' : ''}`}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-muted">{i + 1}</td>
                    <td className="px-5 py-3">
                      <AddressDisplay address={addr} chars={4} showExplorer={false} />
                      {isSelf && <span className="ml-1 text-xs text-terra-400">(you)</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {isCreatorAddr && <Badge variant="terra">Creator</Badge>}
                        {approved && !isRemoved && <Badge variant="active">Active</Badge>}
                        {joined && !approved && <Badge variant="pending">Awaiting approval</Badge>}
                        {isRemoved && <Badge variant="danger">Removed</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <UsdcAmount amount={reserveBalance as bigint} size="sm" />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {hasCreditorDebt ? (
                        <span className="flex items-center justify-end gap-1 text-danger">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <UsdcAmount amount={creditorDebt} size="sm" className="text-danger" />
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
