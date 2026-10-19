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

  const { data: payoutOrderData } = useReadContracts({
    contracts: [{ ...adasheContract, functionName: 'getPayoutOrder', args: [cid] }],
  })

  const payoutOrder = (payoutOrderData?.[0]?.status === 'success'
    ? (payoutOrderData[0].result as string[])
    : [])

  const memberRecordContracts = payoutOrder.map((addr) => ({
    ...adasheContract,
    functionName: 'memberRecords' as const,
    args: [cid, addr as `0x${string}`],
  }))

  const { data: memberData, isLoading } = useReadContracts({
    contracts: memberRecordContracts,
    query: { enabled: payoutOrder.length > 0 },
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
          const [approved, joined, reserveBalance, debtBalance, removedAt] = rec ?? [false, false, 0n, 0n, 0n, '']
          const isCreatorAddr = sameAddress(addr, creator as string)
          const isSelf = sameAddress(addr, currentAddress)
          const isRemoved = (removedAt as bigint) > 0n
          const hasDebt = (debtBalance as bigint) > 0n

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
                  {hasDebt ? (
                    <span className="flex items-center gap-1 text-danger">
                      <AlertTriangle className="h-3 w-3" />
                      <UsdcAmount amount={debtBalance as bigint} size="sm" className="text-danger" />
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
        {/* Horizontal scroll safety net */}
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
                const [approved, joined, reserveBalance, debtBalance, removedAt] = rec ?? [false, false, 0n, 0n, 0n, '']
                const isCreatorAddr = sameAddress(addr, creator as string)
                const isSelf = sameAddress(addr, currentAddress)
                const isRemoved = (removedAt as bigint) > 0n
                const hasDebt = (debtBalance as bigint) > 0n

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
                      {hasDebt ? (
                        <span className="flex items-center justify-end gap-1 text-danger">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <UsdcAmount amount={debtBalance as bigint} size="sm" className="text-danger" />
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
