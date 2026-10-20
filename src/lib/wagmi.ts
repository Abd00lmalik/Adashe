'use client'

import { createConfig, http } from 'wagmi'
import { getDefaultConfig } from 'connectkit'
import { defineChain } from 'viem'

// Arc Testnet — chain ID 5042002
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18, // native view; ERC-20 view is 6 decimals
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Testnet Explorer',
      url: 'https://explorer.testnet.arc.io',
    },
  },
  testnet: true,
})

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [arcTestnet],
    transports: {
      [arcTestnet.id]: http(
        process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.io'
      ),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
    appName: 'Adashe',
    appDescription:
      'Private, invitation-based rotating savings circles, powered by USDC on Arc.',
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000',
    appIcon: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000'}/icon.png`,
  })
)

export const ARC_TESTNET_CHAIN_ID = arcTestnet.id
