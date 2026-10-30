'use client'

import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { ACTIVE_CHAIN_ID, activeChain } from '@/lib/wagmi'
import { Button } from './button'
import { AlertTriangle } from 'lucide-react'

interface ChainGuardProps {
  children: React.ReactNode
}

export function ChainGuard({ children }: ChainGuardProps) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected) return <>{children}</>

  if (chainId !== ACTIVE_CHAIN_ID) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-amber-100 p-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="font-display font-semibold text-amber-800 text-sm">Wrong Network</p>
          <p className="text-xs text-amber-700 mt-0.5">
            This app runs on {activeChain.name}. Please switch to continue.
          </p>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
          disabled={isPending}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {isPending ? 'Switching…' : `Switch to ${activeChain.name}`}
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
