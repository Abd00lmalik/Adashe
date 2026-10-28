import type { Address, Abi } from 'viem'

// ABI sourced directly from the compiled artifact — do not edit manually.
// Contract: AdasheCircle v13 at 0xbb1f1e47900a966a12250c1dc0c9fe325f1caebf on Arc Mainnet
import rawMetadata from '../../contracts/contract-metadata/AdasheCircle.json'

export const CONTRACT_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address) ??
  '0xbb1f1e47900a966a12250c1dc0c9fe325f1caebf'

// Extract ABI from the metadata file
export const CONTRACT_ABI = rawMetadata.abi as Abi

// Typed contract config for wagmi hooks
export const adasheContract = {
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
}

// Enum mirrors — must match AdasheCircle.sol enums exactly
export enum Frequency {
  WEEKLY = 0,
  MONTHLY = 1,
  DAILY = 2,
}

export enum CircleStatus {
  PENDING = 0,
  ACTIVE = 1,
  COMPLETED = 2,
}

export enum ContributionStatus {
  PENDING = 0,
  PAID = 1,
  LATE_PAID = 2,
  DEFAULTED = 3,
  COVERED_BY_RESERVE = 4,
}

export const CIRCLE_STATUS_LABELS: Record<CircleStatus, string> = {
  [CircleStatus.PENDING]: 'Pending',
  [CircleStatus.ACTIVE]: 'Active',
  [CircleStatus.COMPLETED]: 'Completed',
}

export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
  [ContributionStatus.PENDING]: 'Pending',
  [ContributionStatus.PAID]: 'Paid',
  [ContributionStatus.LATE_PAID]: 'Paid Late',
  [ContributionStatus.DEFAULTED]: 'Defaulted',
  [ContributionStatus.COVERED_BY_RESERVE]: 'Covered by Reserve',
}

export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  [Frequency.WEEKLY]: 'Weekly',
  [Frequency.MONTHLY]: 'Monthly',
  [Frequency.DAILY]: 'Daily',
}

export function frequencyLabel(f: number): string {
  return FREQUENCY_LABELS[f as Frequency] ?? 'Unknown'
}

// Explorer URL helper — mainnet by default; falls back to testnet when NEXT_PUBLIC_NETWORK=testnet
const explorerBase =
  process.env.NEXT_PUBLIC_NETWORK === 'testnet'
    ? 'https://explorer.testnet.arc.io'
    : 'https://explorer.arc.io'

export const explorerTx = (hash: string) => `${explorerBase}/tx/${hash}`
export const explorerAddress = (addr: string) => `${explorerBase}/address/${addr}`
