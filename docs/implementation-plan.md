No problem. Here is the complete plan so everything is clear before you switch.

---

## Plan

### Fix 1 — Reserve debt is not the same as defaulted debt

**The contract correctly distinguishes two debts:**
- `_debtByPeriod[period][member]` — creditor debt: owed to the recipient because the member fully defaulted with no reserve. This blocks their payout.
- `_reserveDebtByPeriod[period][member]` — reserve repayment: the member's reserve was consumed to cover their missed contribution. They owe this back to restore their own reserve. This does NOT block their payout — it is a voluntary restoration.

**What will change in `DebtPanel`:**
- Compute `creditorDebtTotal` (sum of `_debtByPeriod` across periods) separately from `reserveDebtTotal` (sum of `_reserveDebtByPeriod`)
- The "blocks your payout" red warning only shows when `creditorDebtTotal > 0`
- Reserve repayment entries are shown in a separate soft section: "Reserve repayment available — restore your reserve" — amber, not red, no payout-blocking language
- If a member only has reserve debt and zero creditor debt, the panel shows green "No outstanding debt" for the blocking section, with a separate amber card for the optional reserve restoration
- The total `debtBalance` from `memberRecords` is not used for the blocking warning (it lumps both together). We use the per-period breakdown instead.

---

### Fix 2 — Notifications must show circle activity, not just DB entries

**The current problem:** The DB is empty because notifications are only written when grace expires. The panel fetches the DB and finds nothing.

**The right approach:** Generate notifications directly from on-chain circle state when the user opens a circle page. These are computed locally from data already fetched — no extra DB writes needed for most of them. They are surfaced as in-app activity items in the notification panel.

**New hook: `useCircleNotifications(circleId, address, role)`** — reads circle state and returns a list of activity items for the panel. These are computed, not fetched:

| Event | Who sees it | Source |
|-------|-------------|--------|
| Deadline approaching (within 24h) | Every non-recipient member | `p.deadline - now < 24h` |
| Grace period active, you have not paid | Non-recipient member | `deadlinePast && !graceExpired && contribution.status === PENDING` |
| Grace period expiring soon (within 6h) | Non-recipient member | `graceExpiry - now < 6h && still pending` |
| Period finalized, new period started | All members | `p.payoutReleased === true` for prior period, new `currentPeriod` |
| Member in grace period, has not paid | Creator only | Any participant with `PENDING` status and `deadlinePast` |
| Member passed grace period without paying | Creator only | Any participant with `DEFAULTED` or `COVERED_BY_RESERVE` status |
| Member replaced | All members | `getReplacementInfo` if available |
| Payout available to claim | Recipient | `claimableAmount > 0` or `progressivelyPaid < maxSpendable` |

These notifications are rendered in the panel as a combined list: DB-persisted ones (missed payments sent to creator) first, then computed on-chain activity. Duplicates are suppressed by a stable key.

**New `NotificationType` enum values needed:**
- `GRACE_PERIOD_WARNING` — member entering or in grace period
- `PERIOD_STARTED` — new period has begun
- `MEMBER_REPLACED` — a member was replaced

These are added to `prisma/schema.prisma`. The Supabase SQL to run:
```sql
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GRACE_PERIOD_WARNING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PERIOD_STARTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEMBER_REPLACED';
```

---

Switch to Build mode and come back — I will build both fixes immediately.
