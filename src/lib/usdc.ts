import type { Address } from 'viem'
import { formatUnits, parseUnits } from 'viem'

// USDC ERC-20 on Arc.
// The address 0x3600000000000000000000000000000000000000 is the same on both
// Arc Mainnet (chain 5042) and Arc Testnet (chain 5042002) — this is by design;
// it is the native ERC-20 interface for Arc's native USDC asset.
// Source: https://docs.arc.io/arc/references/contract-addresses
export const USDC_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as Address) ??
  '0x3600000000000000000000000000000000000000'

// ERC-20 view: 6 decimals — use for ALL balances, transfers, approvals, display.
// NEVER add the native balance (18-decimal view) to this — they are the same asset.
export const USDC_DECIMALS = 6

// Minimal ERC-20 ABI for allowance/approve/transfer reads
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

/** Format a raw uint256 USDC amount (6 decimals) to a human-readable string. */
export function formatUsdc(raw: bigint, decimals = 2): string {
  return parseFloat(formatUnits(raw, USDC_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Parse a human-readable USDC string to a raw uint256 bigint. */
export function parseUsdc(amount: string | number): bigint {
  return parseUnits(String(amount), USDC_DECIMALS)
}

/** Format USDC with explicit currency label. */
export function formatUsdcFull(raw: bigint, decimals = 2): string {
  return `${formatUsdc(raw, decimals)} USDC`
}
