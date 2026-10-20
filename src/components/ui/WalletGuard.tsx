'use client'

import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Wallet } from 'lucide-react'

interface WalletGuardProps {
  children: React.ReactNode
  message?: string
}

export function WalletGuard({
  children,
  message = 'Connect your wallet to continue.',
}: WalletGuardProps) {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4 text-center">
        <div className="rounded-full bg-forest-50 p-4">
          <Wallet className="h-7 w-7 text-forest-400" />
        </div>
        <div>
          <p className="font-display font-semibold text-forest-500">{message}</p>
          <p className="text-sm text-muted mt-1">
            Your wallet address is your identity. No account creation required.
          </p>
        </div>
        <ConnectKitButton />
      </div>
    )
  }

  return <>{children}</>
}
