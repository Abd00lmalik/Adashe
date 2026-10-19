import type { Address, Abi } from 'viem'

// ABI sourced directly from the compiled artifact — do not edit manually.
// Contract: AdasheCircle v4 at 0xcd7c871f4d0ce61ef2c90f12d2b0384299134784 on Arc Testnet
import rawMetadata from '../../contracts/contract-metadata/AdasheCircle.json'

export const CONTRACT_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address) ??
  '0xcd7c871f4d0ce61ef2c90f12d2b0384299134784'

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

// Explorer URL helper
export const explorerTx = (hash: string) =>
  `https://explorer.testnet.arc.io/tx/${hash}`

export const explorerAddress = (addr: string) =>
  `https://explorer.testnet.arc.io/address/${addr}`
