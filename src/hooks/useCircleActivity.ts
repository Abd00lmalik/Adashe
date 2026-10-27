/**
 * useCircleActivity
 *
 * Derives a list of activity notifications directly from on-chain circle state.
 * These are computed locally — no extra RPC calls beyond what the circle page
 * already fetches. They supplement the DB-persisted notifications in the panel.
 *
 * Events generated:
 *  - Deadline approaching (< 24h away)         → all non-recipient members
 *  - You are in grace period, unpaid            → the specific member
 *  - Grace period expiring soon (< 6h)         → the specific member
 *  - Member in grace period (creator view)     → creator for each such member
 *  - Member defaulted / missed entirely        → creator
 *  - New period started                        → all members
 *  - Payout available to claim                 → recipient
 */

import { useMemo } from 'react'
import type { NotificationType } from '@prisma/client'
import { GRACE_PERIOD_BY_FREQUENCY } from '@/lib/schedule'

export interface ActivityItem {
  id: string              // stable synthetic key — no DB
  circleId: string
  type: NotificationType
  title: string
  body: string
  createdAt: string       // ISO — used for sorting
  readAt: null            // always unread (computed fresh each render)
}

interface ContribRecord {
  status: number          // ContributionStatus enum value
  paidAmount: bigint
}

interface PeriodData {
  recipient: string
  deadline: bigint        // unix seconds
  grossEntitlement: bigint
  payoutReleased: boolean
  payoutWithheld: boolean
  withheldAmount: bigint
  claimableAmount: bigint
  progressivelyPaid: bigint
  participants: string[]
}

interface UseCircleActivityParams {
  circleId: string | bigint
  address?: string                    // connected wallet (undefined = not connected)
  isCreator: boolean
  currentPeriodIndex: number
  frequency: number                   // Frequency enum value
  gracePeriodSecs: bigint             // from circles() getter
  reserveAmount?: bigint              // from circles() getter — used to compute exact available
  periodData?: PeriodData | null
  /** map of participant address → ContribRecord for current period */
  contributionMap?: Record<string, ContribRecord>
  /** previous periods: array of { payoutReleased } indexed by period */
  previousPeriods?: Array<{ payoutReleased: boolean }>
}

function addr(a: string) { return a.toLowerCase() }

export function useCircleActivity({
  circleId,
  address,
  isCreator,
  currentPeriodIndex,
  frequency,
  gracePeriodSecs,
  reserveAmount = 0n,
  periodData,
  contributionMap = {},
  previousPeriods = [],
}: UseCircleActivityParams): ActivityItem[] {
  return useMemo(() => {
    if (!periodData) return []

    const now = Date.now()
    const items: ActivityItem[] = []
    const cid = String(circleId)

    const deadlineMs = Number(periodData.deadline) * 1000
    const graceMs = Number(gracePeriodSecs) * 1000
    const graceExpiryMs = deadlineMs + graceMs
    const deadlinePast = now > deadlineMs
    const graceExpired = now > graceExpiryMs

    const connected = address ? addr(address) : null
    const recipient = addr(periodData.recipient)
    const isRecipient = !!connected && connected === recipient

    // ── 1. Deadline approaching (within 24h, not yet past) ──────────────────
    if (!deadlinePast && deadlineMs - now < 24 * 3600 * 1000 && connected && !isRecipient) {
      const contrib = contributionMap[connected]
      const hasPaid = contrib && (contrib.status === 1 || contrib.status === 2)
      if (!hasPaid) {
        const hoursLeft = Math.round((deadlineMs - now) / 3600_000)
        items.push({
          id: `deadline-${cid}-${currentPeriodIndex}`,
          circleId: cid,
          type: 'DEADLINE_APPROACHING',
          title: 'Contribution deadline approaching',
          body: `You have ${hoursLeft}h to contribute for Period ${currentPeriodIndex + 1} before the deadline.`,
          createdAt: new Date().toISOString(),
          readAt: null,
        })
      }
    }

    // ── 2. You are in grace period and have not paid ─────────────────────────
    if (deadlinePast && !graceExpired && connected && !isRecipient) {
      const contrib = contributionMap[connected]
      const hasPaid = contrib && (contrib.status === 1 || contrib.status === 2)
      if (!hasPaid) {
        const graceLabel = GRACE_PERIOD_BY_FREQUENCY[frequency as keyof typeof GRACE_PERIOD_BY_FREQUENCY]
          ?? 'grace period'
        const expiryDate = new Date(graceExpiryMs).toLocaleString('en-GB', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        })
        // Grace expiring soon (< 6h)
        if (graceExpiryMs - now < 6 * 3600_000) {
          items.push({
            id: `grace-urgent-${cid}-${currentPeriodIndex}`,
            circleId: cid,
            type: 'GRACE_PERIOD_WARNING',
            title: 'Grace period ending soon',
            body: `Your ${graceLabel} expires at ${expiryDate} UTC. Pay now to avoid your reserve being used.`,
            createdAt: new Date().toISOString(),
            readAt: null,
          })
        } else {
          items.push({
            id: `grace-active-${cid}-${currentPeriodIndex}`,
            circleId: cid,
            type: 'GRACE_PERIOD_WARNING',
            title: 'You missed the deadline — grace period active',
            body: `You can still pay late for Period ${currentPeriodIndex + 1}. Grace period ends ${expiryDate} UTC.`,
            createdAt: new Date().toISOString(),
            readAt: null,
          })
        }
      }
    }

    // ── 3. Payout available to claim (recipient) ─────────────────────────────
    if (isRecipient && !periodData.payoutReleased) {
      const claimable = periodData.claimableAmount
      const progressive = periodData.progressivelyPaid

      // Compute how much is actually available right now from the contribution map.
      // paidSoFar = sum of PAID (1) + LATE_PAID (2) + COVERED_BY_RESERVE (4) contributions.
      let paidSoFar = 0n
      for (const cr of Object.values(contributionMap)) {
        if (cr.status === 1 || cr.status === 2 || cr.status === 4) {
          paidSoFar += cr.paidAmount
        }
      }
      const spendable = paidSoFar > reserveAmount ? paidSoFar - reserveAmount : 0n
      const exactAvailableNow = spendable > progressive ? spendable - progressive : 0n

      // Only show if there is something genuinely new to claim:
      // — a finalized period with claimable > 0, OR
      // — an open period with exact available > 0 (contributions above reserve threshold, not yet claimed)
      const hasSomethingToClaim = claimable > 0n || exactAvailableNow > 0n
      if (hasSomethingToClaim) {
        items.push({
          id: `payout-${cid}-${currentPeriodIndex}`,
          circleId: cid,
          type: 'PAYOUT_AVAILABLE',
          title: 'Payout available',
          body: claimable > 0n
            ? `You have ${Number(claimable) / 1_000_000} USDC ready to claim for Period ${currentPeriodIndex + 1}.`
            : `${Number(exactAvailableNow) / 1_000_000} USDC available to claim for Period ${currentPeriodIndex + 1}.`,
          createdAt: new Date().toISOString(),
          readAt: null,
        })
      }
    }

    // ── 4. Creator alerts: members in grace or defaulted ────────────────────
    if (isCreator && deadlinePast) {
      for (const participant of periodData.participants) {
        if (addr(participant) === recipient) continue
        const contrib = contributionMap[addr(participant)]
        if (!contrib) continue

        const isPending = contrib.status === 0
        const isDefaulted = contrib.status === 3 || contrib.status === 4

        if (isPending && !graceExpired) {
          // Member is in grace — not yet defaulted
          const shortAddr = `${participant.slice(0, 6)}…${participant.slice(-4)}`
          items.push({
            id: `creator-grace-${cid}-${currentPeriodIndex}-${participant}`,
            circleId: cid,
            type: 'GRACE_PERIOD_WARNING',
            title: `Member in grace period`,
            body: `${shortAddr} missed the deadline for Period ${currentPeriodIndex + 1} and is in the grace period.`,
            createdAt: new Date().toISOString(),
            readAt: null,
          })
        } else if (isDefaulted || (isPending && graceExpired)) {
          // Member fully defaulted
          const shortAddr = `${participant.slice(0, 6)}…${participant.slice(-4)}`
          const covered = contrib.status === 4
          items.push({
            id: `creator-default-${cid}-${currentPeriodIndex}-${participant}`,
            circleId: cid,
            type: 'MISSED_PAYMENT',
            title: `Member missed contribution`,
            body: covered
              ? `${shortAddr} missed Period ${currentPeriodIndex + 1}. Their reserve was used to cover it.`
              : `${shortAddr} missed Period ${currentPeriodIndex + 1} with no reserve to cover it. Debt recorded.`,
            createdAt: new Date().toISOString(),
            readAt: null,
          })
        }
      }
    }

    // ── 5. New period started (previous period was finalized) ────────────────
    if (currentPeriodIndex > 0) {
      const prev = previousPeriods[currentPeriodIndex - 1]
      if (prev?.payoutReleased) {
        items.push({
          id: `period-started-${cid}-${currentPeriodIndex}`,
          circleId: cid,
          type: 'PERIOD_STARTED',
          title: `Period ${currentPeriodIndex + 1} has started`,
          body: `Period ${currentPeriodIndex} is complete. Contributions for Period ${currentPeriodIndex + 1} are now open.`,
          createdAt: new Date(deadlineMs - Number(gracePeriodSecs) * 1000).toISOString(),
          readAt: null,
        })
      }
    }

    // Sort newest first
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [
    circleId, address, isCreator, currentPeriodIndex, frequency,
    gracePeriodSecs, reserveAmount, periodData, contributionMap, previousPeriods,
  ])
}
