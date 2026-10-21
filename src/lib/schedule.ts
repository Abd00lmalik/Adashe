/**
 * schedule.ts — client-side mirror of AdasheCircle._periodDeadline()
 *
 * Uses the same formula as the Solidity contract so the schedule preview
 * and canFinalize check are consistent with on-chain state.
 *
 * All timestamps are UNIX seconds (matching block.timestamp).
 */

import { Frequency } from './contract'

// Grace periods per frequency — must match AdasheCircle.sol constants exactly.
export const GRACE_PERIOD_BY_FREQUENCY: Record<Frequency, number> = {
  [Frequency.DAILY]:   12 * 3600,        // 12 hours
  [Frequency.WEEKLY]:  3  * 24 * 3600,   // 3 days
  [Frequency.MONTHLY]: 10 * 24 * 3600,   // 10 days
}

export const GRACE_PERIOD_LABEL: Record<Frequency, string> = {
  [Frequency.DAILY]:   '12-hour grace period per contribution',
  [Frequency.WEEKLY]:  '3-day grace period per contribution',
  [Frequency.MONTHLY]: '10-day grace period per contribution',
}

// ─── Calendar helpers (mirrors Solidity arithmetic) ─────────────────────────

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  const m31 = [1, 3, 5, 7, 8, 10, 12]
  if (m31.includes(month)) return 31
  if ([4, 6, 9, 11].includes(month)) return 30
  return isLeapYear(year) ? 29 : 28
}

/** Return a UTC Date for year/month/day at midnight UTC. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Compute the weekday anchor: the next (or same) occurrence of `targetWeekday`
 * (0 = Sunday) on or after `startTimeSec`.
 * Mirrors _weekdayAnchor() in Solidity.
 */
function weekdayAnchor(startTimeSec: number, targetWeekday: number): number {
  const dayNumber = Math.floor(startTimeSec / 86400)
  const currentWeekday = (dayNumber + 3) % 7  // Thu=0 offset, same as contract
  const dayDelta = (targetWeekday + 7 - currentWeekday) % 7
  return startTimeSec + dayDelta * 86400
}

/**
 * Compute the monthly deadline for periodIndex n >= 1.
 * Mirrors _monthlyDeadline() in Solidity.
 */
function monthlyDeadline(startTimeSec: number, anchorDay: number, n: number): number {
  const startDate = new Date(startTimeSec * 1000)
  const year0 = startDate.getUTCFullYear()
  const month0 = startDate.getUTCMonth() + 1  // 1-based
  const timeOfDay = startTimeSec % 86400

  const monthIndex = (month0 - 1) + n
  const targetYear  = year0 + Math.floor(monthIndex / 12)
  const targetMonth = (monthIndex % 12) + 1

  const lastDay   = daysInMonth(targetYear, targetMonth)
  const targetDay = Math.min(anchorDay, lastDay)

  const epochMs = utcDate(targetYear, targetMonth, targetDay).getTime()
  return Math.floor(epochMs / 1000) + timeOfDay
}

/**
 * Compute the contribution deadline (UNIX seconds) for a given period index.
 *
 * Mirrors AdasheCircle._periodDeadline() exactly:
 * - n = periodIndex + 1  (every period gets a full window; period 0 = 1 interval)
 * - DAILY:   startTime + n * 86400
 * - WEEKLY:  weekdayAnchor(startTime, weekday) + n * 7 * 86400
 * - MONTHLY: monthlyDeadline(startTime, anchorDay, n)
 */
export function computeDeadline(
  startTimeSec: number,
  frequency: Frequency,
  weekday: number,
  anchorDay: number,
  periodIndex: number,
): number {
  const n = periodIndex + 1

  if (frequency === Frequency.DAILY) {
    return startTimeSec + n * 86400
  }
  if (frequency === Frequency.WEEKLY) {
    return weekdayAnchor(startTimeSec, weekday) + n * 7 * 86400
  }
  return monthlyDeadline(startTimeSec, anchorDay, n)
}

/**
 * Compute the grace expiry (UNIX seconds) for a given period deadline.
 */
export function graceExpiry(deadlineSec: number, frequency: Frequency): number {
  return deadlineSec + GRACE_PERIOD_BY_FREQUENCY[frequency]
}

/**
 * Returns true when the grace period for a given deadline has fully expired.
 * Uses the current wall-clock time.
 */
export function isGraceExpired(deadlineSec: number, frequency: Frequency): boolean {
  const now = Math.floor(Date.now() / 1000)
  return now > graceExpiry(deadlineSec, frequency)
}

/**
 * Generate the full schedule preview for a circle that has not yet started.
 * `startTimeSec` is estimated as "now" for the preview.
 */
export interface PeriodPreview {
  periodIndex: number
  recipientAddress: string
  deadlineSec: number
  graceExpirySec: number
}

export function buildSchedulePreview(
  estimatedStartSec: number,
  frequency: Frequency,
  weekday: number,
  anchorDay: number,
  payoutOrder: string[],
): PeriodPreview[] {
  return payoutOrder.map((address, i) => {
    const dl = computeDeadline(estimatedStartSec, frequency, weekday, anchorDay, i)
    return {
      periodIndex: i,
      recipientAddress: address,
      deadlineSec: dl,
      graceExpirySec: graceExpiry(dl, frequency),
    }
  })
}
