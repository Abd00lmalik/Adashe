'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { useParams } from 'next/navigation'
import { useAccount, useReadContracts } from 'wagmi'
import { Navbar } from '@/components/layout/Navbar'
import { WalletGuard } from '@/components/ui/WalletGuard'
import { ChainGuard } from '@/components/ui/ChainGuard'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { CircleHeader } from '@/components/circle/CircleHeader'
import { MembersList } from '@/components/circle/MembersList'
import { PeriodTimeline } from '@/components/circle/PeriodTimeline'
import { CurrentPeriod } from '@/components/circle/CurrentPeriod'
import { PayoutPanel } from '@/components/circle/PayoutPanel'
import { DebtPanel } from '@/components/circle/DebtPanel'
import { ReservePanel } from '@/components/circle/ReservePanel'
import { CreatorPanel } from '@/components/circle/CreatorPanel'
import { CircleActivityFeed } from '@/components/circle/CircleActivityFeed'
import { adasheContract, CircleStatus } from '@/lib/contract'
import { sameAddress } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Error boundary — catches rendering exceptions so a single bad field cannot
// leave the user on a permanently blank page.
// ---------------------------------------------------------------------------
interface EBState { hasError: boolean; message: string }
class CircleErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(err: unknown): EBState {
    const message = err instanceof Error ? err.message : String(err)
    return { hasError: true, message }
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[CircleErrorBoundary]', err, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-ivory-DEFAULT flex flex-col items-center justify-center px-6 text-center gap-4">
          <p className="text-lg font-semibold text-forest-500">Something went wrong loading this circle.</p>
          <p className="text-sm text-muted max-w-sm">{this.state.message}</p>
          <button
            className="mt-2 px-4 py-2 rounded-xl bg-forest-500 text-white text-sm font-medium hover:bg-forest-600 transition-colors"
            onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload() }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function CirclePage() {
  const { circleId } = useParams<{ circleId: string }>()
  const { address } = useAccount()
  const cid = BigInt(circleId)

  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...adasheContract, functionName: 'circles', args: [cid] },
      ...(address
        ? [{ ...adasheContract, functionName: 'memberRecords', args: [cid, address as `0x${string}`] }]
        : []),
    ],
    query: { staleTime: 0, refetchOnMount: true },
  })

  const circleRaw = data?.[0]?.status === 'success' ? data[0].result : null
  const memberRaw = data?.[1]?.status === 'success' ? data[1].result : null

  return (
    <div className="min-h-dvh bg-ivory-DEFAULT">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <WalletGuard>
          <ChainGuard>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-64 rounded-2xl" />
              </div>
            ) : !circleRaw ? (
              <div className="text-center py-20 text-muted">Circle not found.</div>
            ) : (
              <CircleErrorBoundary>
                <CircleDetailContent
                  cid={cid}
                  circleRaw={circleRaw as readonly unknown[]}
                  memberRaw={memberRaw as readonly unknown[] | null}
                  address={address}
                />
              </CircleErrorBoundary>
            )}
          </ChainGuard>
        </WalletGuard>
      </main>
    </div>
  )
}

function CircleDetailContent({
  cid,
  circleRaw,
  memberRaw,
  address,
}: {
  cid: bigint
  circleRaw: readonly unknown[]
  memberRaw: readonly unknown[] | null
  address?: string
}) {
  const [, creator, , , , , , , , status, , currentPeriod] = circleRaw as [
    bigint, string, string, bigint, number, number, number, number, string, number, bigint, number, bigint, bigint
  ]

  const isCreator = sameAddress(creator, address)
  // memberRecords returns (approved, joined, reserveBalance, debtBalance, positionPlusOne, removedAt)
  // Use optional chaining per field — the tuple shape can vary if the call reverts or wallet just connected.
  const memberTuple = memberRaw as [boolean, boolean, bigint, bigint, bigint, string] | null
  const approved = memberTuple?.[0] ?? false
  const debtBalance = memberTuple?.[3] ?? 0n
  const hasDebt = debtBalance > 0n
  const isCompleted = status === CircleStatus.COMPLETED

  return (
    <div className="space-y-5">
      <CircleHeader cid={cid} circleRaw={circleRaw} isCreator={isCreator} />

      <Tabs defaultValue="overview">
        {/* Horizontal scroll for tabs on mobile — whitespace-nowrap keeps triggers from wrapping */}
        <div className="overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
          <TabsList className="w-max min-w-full">
            <TabsTrigger value="overview" className="shrink-0">Overview</TabsTrigger>
            <TabsTrigger value="members" className="shrink-0">Members</TabsTrigger>
            <TabsTrigger value="periods" className="shrink-0">Periods</TabsTrigger>
            {approved && <TabsTrigger value="my-position" className="shrink-0">My Position</TabsTrigger>}
            {isCreator && <TabsTrigger value="manage" className="shrink-0">Manage</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <CurrentPeriod cid={cid} circleRaw={circleRaw} address={address} />
              {approved && hasDebt && <DebtPanel cid={cid} address={address!} />}
            </div>
            <div className="rounded-2xl border border-ivory-300 bg-white p-4">
              <h3 className="text-sm font-semibold text-forest-500 mb-3">Activity</h3>
              <CircleActivityFeed cid={cid} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="members">
          <MembersList cid={cid} circleRaw={circleRaw} currentAddress={address} />
        </TabsContent>

        <TabsContent value="periods">
          <PeriodTimeline cid={cid} circleRaw={circleRaw} address={address} />
        </TabsContent>

        {approved && (
          <TabsContent value="my-position">
            <div className="space-y-4">
              <PayoutPanel cid={cid} circleRaw={circleRaw} address={address!} />
              <DebtPanel cid={cid} address={address!} showReserveRepayment={true} />
              <ReservePanel cid={cid} address={address!} />
            </div>
          </TabsContent>
        )}

        {isCreator && (
          <TabsContent value="manage">
            <CreatorPanel cid={cid} circleRaw={circleRaw} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
