'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { wagmiConfig } from '@/lib/wagmi'
import { useState } from 'react'

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000, // 10s — contract reads are fresh for 10s
        retry: 2,
      },
    },
  }))

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          customTheme={{
            '--ck-font-family': "'DM Sans', sans-serif",
            '--ck-primary-button-background': '#C77D55',
            '--ck-primary-button-hover-background': '#B56840',
            '--ck-body-background': '#F5F0E6',
            '--ck-body-color': '#244B3C',
            '--ck-border-radius': '12px',
            '--ck-overlay-background': 'rgba(36,75,60,0.6)',
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
