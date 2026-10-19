'use client'

import { useAccount } from 'wagmi'
import { useReadContracts } from 'wagmi'
import Link from 'next/link'
import { Plus, Circle } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { WalletGuard } from '@/components/ui/WalletGuard'
import { ChainGuard } from '@/components/ui/ChainGuard'
import { CircleCard } from '@/components/dashboard/CircleCard'
import { Skeleton } from '@/components/ui/skeleton'
import { adasheContract } from '@/lib/contract'
import { useMemo } from 'react'

// We index circle IDs that include the connected wallet by reading `isInPayoutOrder`
// for circles 1..N. In production, a backend indexer would provide this list.
// Here we scan up to 20 circles as a reasonable testnet limit.
const MAX_CIRCLES_TO_SCAN = 20

export default function DashboardPage() {
  return (
    <div className="min-h-dvh bg-ivory-DEFAULT">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <WalletGuard message="Connect your wallet to see your circles.">
          <ChainGuard>
            <DashboardContent />
          </ChainGuard>
        </WalletGuard>
      </main>
    </div>
  )
}

function DashboardContent() {
  const { address } = useAccount()

  // Build contracts array to check if address is in payoutOrder for circles 1..N
  const memberCheckContracts = useMemo(() => {
    if (!address) return []
    return Array.from({ length: MAX_CIRCLES_TO_SCAN }, (_, i) => ({
      ...adasheContract,
      functionName: 'isInPayoutOrder' as const,
      args: [BigInt(i + 1), address] as [bigint, `0x${string}`],
    }))
  }, [address])

  const { data: memberChecks, isLoading: loadingMembership } = useReadContracts({
    contracts: memberCheckContracts,
    query: { enabled: !!address, staleTime: 30_000 },
  })

  // Which circle IDs is this wallet a member of?
  const myCircleIds = useMemo(() => {
    if (!memberChecks) return []
    return memberChecks
      .map((result, i) => (result.status === 'success' && result.result === true ? i + 1 : null))
      .filter((id): id is number => id !== null)
  }, [memberChecks])

  const isLoading = loadingMembership

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl text-forest-500 tracking-tighter">
            My Circles
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Circles you have joined or created
          </p>
        </div>
        <Link
          href="/circles/new"
          className="inline-flex items-center gap-1.5 bg-terra-400 hover:bg-terra-500 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 min-h-[44px]"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden xs:inline sm:inline">New Circle</span>
        </Link>
      </div>

      {isLoading && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && myCircleIds.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="rounded-full bg-forest-50 p-5">
            <Circle className="h-8 w-8 text-forest-300" />
          </div>
          <div>
            <p className="font-display font-semibold text-forest-500 text-lg">No circles yet</p>
            <p className="text-muted text-sm mt-1 max-w-xs text-pretty">
              Create a circle or ask a creator to send you an invite link.
            </p>
          </div>
          <Link
            href="/circles/new"
            className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
          >
            <Plus className="h-4 w-4" />
            Create my first circle
          </Link>
        </div>
      )}

      {!isLoading && myCircleIds.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {myCircleIds.map((circleId) => (
            <CircleCard key={circleId} circleId={BigInt(circleId)} />
          ))}
        </div>
      )}
    </div>
  )
}
