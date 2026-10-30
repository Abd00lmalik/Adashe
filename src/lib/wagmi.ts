'use client'

import { createConfig, http } from 'wagmi'
import { getDefaultConfig } from 'connectkit'
import { defineChain } from 'viem'

// ---------------------------------------------------------------------------
// Arc Testnet — chain ID 5042002
// ---------------------------------------------------------------------------
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
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

// ---------------------------------------------------------------------------
// Arc Mainnet — chain ID 5042 (source: docs.arc.io/integrate/infrastructure)
// RPC: https://rpc.mainnet.arc.io
// Explorer: https://explorer.arc.io
// USDC: 0x3600000000000000000000000000000000000000 (same address as testnet)
// ---------------------------------------------------------------------------
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL ?? 'https://rpc.mainnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.arc.io',
    },
  },
  testnet: false,
})

// ---------------------------------------------------------------------------
// Network selector — controlled by NEXT_PUBLIC_NETWORK env var
// Defaults to mainnet. Set NEXT_PUBLIC_NETWORK=testnet to use Arc Testnet.
// ---------------------------------------------------------------------------
const isMainnet = process.env.NEXT_PUBLIC_NETWORK !== 'testnet'
export const activeChain = isMainnet ? arcMainnet : arcTestnet

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [activeChain],
    transports: {
      [activeChain.id]: http(
        isMainnet
          ? (process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL ?? 'https://rpc.mainnet.arc.io')
          : (process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.io')
      ),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
    appName: 'Adashe',
    appDescription:
      'Private, invitation-based rotating savings circles, powered by USDC on Arc.',
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://adasheonchain.vercel.app',
    appIcon: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://adasheonchain.vercel.app'}/icon.png`,
  })
)

export const ARC_TESTNET_CHAIN_ID = arcTestnet.id
export const ARC_MAINNET_CHAIN_ID = arcMainnet.id
export const ACTIVE_CHAIN_ID = activeChain.id
