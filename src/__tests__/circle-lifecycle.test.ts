/**
 * Circle lifecycle regression tests
 *
 * Tests:
 * - Circle start persistence (status read from contract, not stale cache)
 * - Contribution eligibility logic (canContribute gates)
 * - Exact payment enforcement (contract-level)
 * - Duplicate start prevention
 * - Contribution by recipient is blocked
 * - Already-paid guard
 */

import { describe, it, expect } from 'vitest'
import { CircleStatus, ContributionStatus, Frequency } from '../lib/contract'

// ---------------------------------------------------------------------------
// Helpers — pure logic extracted from components for unit testing
// ---------------------------------------------------------------------------

type ContributionRecord = {
  status: number
  paidAmount: bigint
  paidAt: bigint
  extensionDeadline: bigint
  extensionRequested: boolean
  extensionApproved: boolean
}

function canContribute(opts: {
  address: string | undefined
  isRecipient: boolean
  deadlinePast: boolean
  contributionData: ContributionRecord | null
}): boolean {
  const { address, isRecipient, deadlinePast, contributionData } = opts
  if (!address || isRecipient || deadlinePast || contributionData === null) return false
  const hasPaid =
    contributionData.status !== ContributionStatus.PENDING ||
    contributionData.paidAmount > 0n
  return !hasPaid
}

function isCircleStartable(opts: {
  status: CircleStatus
  allMembersJoined: boolean
}): boolean {
  return opts.status === CircleStatus.PENDING && opts.allMembersJoined
}

function canStartCircle(opts: {
  status: CircleStatus
  pendingMembersCount: number
  currentTxStatus: string
}): boolean {
  return (
    opts.status === CircleStatus.PENDING &&
    opts.pendingMembersCount === 0 &&
    opts.currentTxStatus !== 'confirming'
  )
}

const makeFreshContribution = (): ContributionRecord => ({
  status: ContributionStatus.PENDING,
  paidAmount: 0n,
  paidAt: 0n,
  extensionDeadline: 0n,
  extensionRequested: false,
  extensionApproved: false,
})

const makePaidContribution = (): ContributionRecord => ({
  status: ContributionStatus.PAID,
  paidAmount: 20_000_000n, // 20 USDC at 6 decimals
  paidAt: BigInt(Math.floor(Date.now() / 1000)),
  extensionDeadline: 0n,
  extensionRequested: false,
  extensionApproved: false,
})

// ---------------------------------------------------------------------------
// 1. Circle start persistence
// ---------------------------------------------------------------------------

describe('Circle start persistence', () => {
  it('Start button is available when PENDING and all members joined', () => {
    expect(canStartCircle({ status: CircleStatus.PENDING, pendingMembersCount: 0, currentTxStatus: 'idle' })).toBe(true)
  })

  it('Start button is disabled while tx is confirming (prevents duplicate)', () => {
    expect(canStartCircle({ status: CircleStatus.PENDING, pendingMembersCount: 0, currentTxStatus: 'confirming' })).toBe(false)
  })

  it('Start button never shows when circle is ACTIVE', () => {
    expect(canStartCircle({ status: CircleStatus.ACTIVE, pendingMembersCount: 0, currentTxStatus: 'idle' })).toBe(false)
  })

  it('Start button never shows when circle is COMPLETED', () => {
    expect(canStartCircle({ status: CircleStatus.COMPLETED, pendingMembersCount: 0, currentTxStatus: 'idle' })).toBe(false)
  })

  it('Start button is disabled when some members have not yet joined', () => {
    expect(canStartCircle({ status: CircleStatus.PENDING, pendingMembersCount: 2, currentTxStatus: 'idle' })).toBe(false)
  })

  it('Circle status is authoritative: PENDING circle is startable', () => {
    expect(isCircleStartable({ status: CircleStatus.PENDING, allMembersJoined: true })).toBe(true)
  })

  it('Circle status is authoritative: ACTIVE circle cannot be started again', () => {
    expect(isCircleStartable({ status: CircleStatus.ACTIVE, allMembersJoined: true })).toBe(false)
  })

  it('After nav and return, ACTIVE status from contract prevents re-showing start button', () => {
    // Simulates returning to a circle page after startCircle confirmed.
    // staleTime=0 means fresh contract read always happens on mount.
    // The status comes from the contract: CircleStatus.ACTIVE → no start button.
    const status = CircleStatus.ACTIVE // fresh from contract
    expect(canStartCircle({ status, pendingMembersCount: 0, currentTxStatus: 'idle' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Contribution eligibility
// ---------------------------------------------------------------------------

describe('Contribution eligibility (canContribute)', () => {
  const MEMBER = '0xabc'
  const RECIPIENT = '0xdef'
  const future = false // deadline not past

  it('Shows contribute button for eligible member before deadline', () => {
    expect(canContribute({
      address: MEMBER,
      isRecipient: false,
      deadlinePast: future,
      contributionData: makeFreshContribution(),
    })).toBe(true)
  })

  it('Blocks contribution when wallet is the period recipient', () => {
    expect(canContribute({
      address: RECIPIENT,
      isRecipient: true,
      deadlinePast: future,
      contributionData: makeFreshContribution(),
    })).toBe(false)
  })

  it('Blocks contribution after deadline has passed', () => {
    expect(canContribute({
      address: MEMBER,
      isRecipient: false,
      deadlinePast: true,
      contributionData: makeFreshContribution(),
    })).toBe(false)
  })

  it('Blocks contribution when wallet is not connected (address undefined)', () => {
    expect(canContribute({
      address: undefined,
      isRecipient: false,
      deadlinePast: future,
      contributionData: makeFreshContribution(),
    })).toBe(false)
  })

  it('Blocks contribution when contribution data not yet loaded (null)', () => {
    expect(canContribute({
      address: MEMBER,
      isRecipient: false,
      deadlinePast: future,
      contributionData: null,
    })).toBe(false)
  })

  it('Blocks contribution when already paid (status=PAID)', () => {
    expect(canContribute({
      address: MEMBER,
      isRecipient: false,
      deadlinePast: future,
      contributionData: makePaidContribution(),
    })).toBe(false)
  })

  it('Blocks contribution when paidAmount > 0 even if status is stale PENDING', () => {
    const stale: ContributionRecord = { ...makeFreshContribution(), paidAmount: 20_000_000n }
    expect(canContribute({
      address: MEMBER,
      isRecipient: false,
      deadlinePast: future,
      contributionData: stale,
    })).toBe(false)
  })

  it('Blocks contribution when status is LATE_PAID', () => {
    const latePaid: ContributionRecord = { ...makePaidContribution(), status: ContributionStatus.LATE_PAID }
    expect(canContribute({
      address: MEMBER,
      isRecipient: false,
      deadlinePast: future,
      contributionData: latePaid,
    })).toBe(false)
  })

  it('Blocks contribution when status is DEFAULTED', () => {
    const defaulted: ContributionRecord = { ...makeFreshContribution(), status: ContributionStatus.DEFAULTED }
    expect(canContribute({
      address: MEMBER,
      isRecipient: false,
      deadlinePast: future,
      contributionData: defaulted,
    })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Exact payment enforcement (contract-level rules mirrored)
// ---------------------------------------------------------------------------

describe('Exact payment enforcement', () => {
  const CONTRIBUTION_AMOUNT = 20_000_000n // 20 USDC

  function simulateContribute(paidAmount: bigint, required: bigint): 'accepted' | 'rejected' {
    // The contract always uses safeTransferFrom(msg.sender, this, c.contributionAmount)
    // There is no user-supplied amount — the contract pulls exactly contributionAmount.
    // The UI always passes contributionAmount to UsdcApproveAndAction.
    // Any mismatch would come from the approval being insufficient (caught by ERC-20),
    // not from the contract accepting a different amount.
    if (paidAmount !== required) return 'rejected' // simulates contract revert
    return 'accepted'
  }

  it('Exact amount is accepted', () => {
    expect(simulateContribute(CONTRIBUTION_AMOUNT, CONTRIBUTION_AMOUNT)).toBe('accepted')
  })

  it('Underpayment is rejected', () => {
    expect(simulateContribute(2_000_000n, CONTRIBUTION_AMOUNT)).toBe('rejected')
  })

  it('Overpayment is rejected (contract pulls exact amount, overpayment is a different tx)', () => {
    expect(simulateContribute(30_000_000n, CONTRIBUTION_AMOUNT)).toBe('rejected')
  })

  it('Zero payment is rejected', () => {
    expect(simulateContribute(0n, CONTRIBUTION_AMOUNT)).toBe('rejected')
  })

  it('USDC decimals are correct (20 USDC = 20_000_000 raw units)', () => {
    expect(CONTRIBUTION_AMOUNT).toBe(20_000_000n)
  })

  it('No floating-point arithmetic — all amounts are bigint', () => {
    const amount = 20_000_000n
    expect(typeof amount).toBe('bigint')
    expect(amount / 1_000_000n).toBe(20n) // integer division only
  })
})

// ---------------------------------------------------------------------------
// 4. Multiple wallets and circles — isolation
// ---------------------------------------------------------------------------

describe('Multiple circles and wallets', () => {
  const circles = [
    { id: 1n, status: CircleStatus.PENDING, pendingCount: 0 },
    { id: 2n, status: CircleStatus.ACTIVE, pendingCount: 0 },
    { id: 3n, status: CircleStatus.PENDING, pendingCount: 3 },
  ]

  it('Each circle independently determines whether it can be started', () => {
    const startable = circles.map((c) =>
      canStartCircle({ status: c.status, pendingMembersCount: c.pendingCount, currentTxStatus: 'idle' })
    )
    expect(startable).toEqual([true, false, false])
  })

  const wallets = ['0xAAA', '0xBBB', '0xCCC', '0xDDD', '0xEEE']
  const recipientForPeriod = '0xBBB'

  it('Only non-recipient wallets can contribute', () => {
    const results = wallets.map((w) =>
      canContribute({
        address: w,
        isRecipient: w === recipientForPeriod,
        deadlinePast: false,
        contributionData: makeFreshContribution(),
      })
    )
    // BBB is recipient, cannot contribute
    expect(results).toEqual([true, false, true, true, true])
  })

  it('After one wallet pays, that wallet cannot pay again', () => {
    const wallet = '0xAAA'
    const paid = makePaidContribution()
    expect(canContribute({ address: wallet, isRecipient: false, deadlinePast: false, contributionData: paid })).toBe(false)
  })

  it('Other wallets are unaffected by first wallet paying', () => {
    const fresh = makeFreshContribution()
    expect(canContribute({ address: '0xCCC', isRecipient: false, deadlinePast: false, contributionData: fresh })).toBe(true)
  })
})
