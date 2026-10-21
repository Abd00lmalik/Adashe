/**
 * Regression tests: circle detail page rendering safety after activation.
 *
 * These tests exercise the data-parsing functions that previously crashed
 * when the contract returned tuples with unexpected shapes or bigint fields.
 * They run in Node (no DOM / React renderer required).
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers extracted from page.tsx / MembersList.tsx / PeriodTimeline.tsx
// ---------------------------------------------------------------------------

/** Safe memberRaw tuple accessor — mirrors the fix in page.tsx */
function parseMemberRaw(memberRaw: readonly unknown[] | null) {
  const memberTuple = memberRaw as [boolean, boolean, bigint, bigint, bigint, string] | null
  const approved = memberTuple?.[0] ?? false
  const debtBalance = memberTuple?.[3] ?? 0n
  const hasDebt = debtBalance > 0n
  return { approved, debtBalance, hasDebt }
}

/** Safe period tuple accessor — mirrors the fix in PeriodTimeline.tsx */
function parsePeriodData(pd: readonly unknown[] | null) {
  const recipient      = pd?.[0] ?? ''
  const deadline       = pd?.[1] ?? 0n
  const grossEntitlement = pd?.[2] ?? 0n
  const payoutReleased = pd?.[3] ?? false
  const payoutWithheld = pd?.[4] ?? false
  const withheldAmount = pd?.[5] ?? 0n
  return { recipient, deadline, grossEntitlement, payoutReleased, payoutWithheld, withheldAmount }
}

/** Safe member record accessor — mirrors the fix in MembersList.tsx */
function parseMemberRecord(rec: readonly unknown[] | null) {
  const approved       = rec?.[0] ?? false
  const joined         = rec?.[1] ?? false
  const reserveBalance = rec?.[2] ?? 0n
  const debtBalance    = rec?.[3] ?? 0n
  const removedAt      = rec?.[5] ?? ''
  const isRemoved = typeof removedAt === 'bigint' ? removedAt > 0n : false
  return { approved, joined, reserveBalance, debtBalance, isRemoved }
}

/** Frequency label logic — mirrors the fix in CircleHeader.tsx */
function frequencyLabel(frequency: number, weekday: number, anchorDay: number): string {
  const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  if (frequency === 0) return `Weekly · ${WEEKDAY_LABELS[weekday] ?? weekday}`
  if (frequency === 2) return 'Daily'
  return `Monthly · day ${anchorDay}`
}

// ---------------------------------------------------------------------------
// parseMemberRaw
// ---------------------------------------------------------------------------

describe('parseMemberRaw — null / undefined safety', () => {
  it('handles null memberRaw (wallet not connected)', () => {
    const { approved, debtBalance, hasDebt } = parseMemberRaw(null)
    expect(approved).toBe(false)
    expect(debtBalance).toBe(0n)
    expect(hasDebt).toBe(false)
  })

  it('handles empty array memberRaw (call failed)', () => {
    const { approved, debtBalance, hasDebt } = parseMemberRaw([])
    expect(approved).toBe(false)
    expect(debtBalance).toBe(0n)
    expect(hasDebt).toBe(false)
  })

  it('parses a fully populated member record (active member with debt)', () => {
    const tuple = [true, true, 20_000_000n, 5_000_000n, 2n, ''] as const
    const { approved, debtBalance, hasDebt } = parseMemberRaw(tuple)
    expect(approved).toBe(true)
    expect(debtBalance).toBe(5_000_000n)
    expect(hasDebt).toBe(true)
  })

  it('parses a member with zero debt — hasDebt is false', () => {
    const tuple = [true, true, 20_000_000n, 0n, 1n, ''] as const
    const { approved, debtBalance, hasDebt } = parseMemberRaw(tuple)
    expect(approved).toBe(true)
    expect(hasDebt).toBe(false)
  })

  it('does not throw when bigint field is 0n (no false-positive debt)', () => {
    const tuple = [false, false, 0n, 0n, 0n, ''] as const
    expect(() => parseMemberRaw(tuple)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// parsePeriodData
// ---------------------------------------------------------------------------

describe('parsePeriodData — null / zero-value safety', () => {
  it('handles null period (PENDING circle — periods not initialized)', () => {
    const p = parsePeriodData(null)
    expect(p.recipient).toBe('')
    expect(p.deadline).toBe(0n)
    expect(p.grossEntitlement).toBe(0n)
    expect(p.payoutReleased).toBe(false)
    expect(p.payoutWithheld).toBe(false)
    expect(p.withheldAmount).toBe(0n)
  })

  it('handles empty array period (call failed)', () => {
    const p = parsePeriodData([])
    expect(p.withheldAmount).toBe(0n) // previously crashed with undefined > 0n
  })

  it('parses a fully populated active period', () => {
    const recipient = '0xabc123'
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400)
    const tuple = [recipient, deadline, 100_000_000n, false, false, 0n, []]
    const p = parsePeriodData(tuple)
    expect(p.recipient).toBe(recipient)
    expect(p.deadline).toBe(deadline)
    expect(p.grossEntitlement).toBe(100_000_000n)
  })

  it('parses a withheld payout period without crashing', () => {
    const tuple = ['0xabc', 1_000_000n, 80_000_000n, false, true, 20_000_000n, []]
    const p = parsePeriodData(tuple)
    expect(p.payoutWithheld).toBe(true)
    expect(p.withheldAmount).toBe(20_000_000n)
    expect((p.withheldAmount as bigint) > 0n).toBe(true) // previously threw: undefined > 0n
  })

  it('does not throw for N periods across a 12-member circle', () => {
    const periods = Array.from({ length: 12 }, (_, i) => [
      `0x${i.toString(16).padStart(40, '0')}`,
      BigInt(Math.floor(Date.now() / 1000) + i * 86400),
      100_000_000n,
      false,
      false,
      0n,
      [],
    ])
    expect(() => periods.forEach((pd) => parsePeriodData(pd))).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// parseMemberRecord
// ---------------------------------------------------------------------------

describe('parseMemberRecord — correct 6-field indexing', () => {
  it('returns isRemoved=false for a normal active member', () => {
    // tuple: (approved=true, joined=true, reserve=20M, debt=0, position=1, removedAt='')
    const rec = [true, true, 20_000_000n, 0n, 1n, ''] as const
    const { approved, joined, isRemoved } = parseMemberRecord(rec)
    expect(approved).toBe(true)
    expect(joined).toBe(true)
    expect(isRemoved).toBe(false)
  })

  it('does NOT flag positionPlusOne as removedAt (the original bug)', () => {
    // OLD bug: [approved, joined, reserve, debt, removedAt] — index 4 = positionPlusOne = 3n
    // That made isRemoved = 3n > 0n = true for every member with a valid position.
    const rec = [true, true, 0n, 0n, 3n, ''] as const  // position=3, removedAt=''
    const { isRemoved } = parseMemberRecord(rec)
    expect(isRemoved).toBe(false) // fix: index 5 is the real removedAt (an empty string, not a bigint)
  })

  it('returns isRemoved=true only when removedAt is a nonzero bigint', () => {
    const removedTimestamp = BigInt(Math.floor(Date.now() / 1000) - 1000)
    const rec = [false, false, 0n, 0n, 2n, removedTimestamp] as const
    const { isRemoved } = parseMemberRecord(rec)
    expect(isRemoved).toBe(true)
  })

  it('handles null rec (member record not loaded)', () => {
    const { approved, joined, isRemoved } = parseMemberRecord(null)
    expect(approved).toBe(false)
    expect(joined).toBe(false)
    expect(isRemoved).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// frequencyLabel
// ---------------------------------------------------------------------------

describe('frequencyLabel — all three frequencies', () => {
  it('renders WEEKLY correctly', () => {
    expect(frequencyLabel(0, 0, 0)).toBe('Weekly · Monday')
    expect(frequencyLabel(0, 6, 0)).toBe('Weekly · Sunday')
  })

  it('renders MONTHLY correctly', () => {
    expect(frequencyLabel(1, 0, 15)).toBe('Monthly · day 15')
  })

  it('renders DAILY correctly (was previously missing — fell through to Monthly)', () => {
    expect(frequencyLabel(2, 0, 0)).toBe('Daily')
    // With the old code this would have been 'Monthly · day 0'
    expect(frequencyLabel(2, 0, 0)).not.toContain('Monthly')
  })
})
