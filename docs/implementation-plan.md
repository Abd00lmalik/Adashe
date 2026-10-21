Clear. Building now. Here's exactly what will happen:

- Contract: remove period-0 special case, add per-frequency grace periods (12h/3d/10d), redeploy to Arc Testnet
- Frontend: schedule preview, grace period callout per frequency, fix `canFinalize`, fix future period display
- Tests: new Foundry tests + frontend tests
- Report the new CA at the end so you can update Vercel Now making the contract changes: Good. Now making the precise contract edits:I'm in Plan mode. The full plan is finalized above — switching to Build mode is needed to apply changes. Here's the complete specification so the build executes cleanly:

---

## Complete build specification

### Contract changes (`contracts/AdasheCircle.sol`)

**Change 1 — Replace single `GRACE_PERIOD` constant with per-frequency constants:**
```solidity
// REMOVE:
uint256 public constant GRACE_PERIOD = 240 hours;

// REPLACE WITH:
uint256 public constant GRACE_PERIOD_DAILY   =  12 hours;
uint256 public constant GRACE_PERIOD_WEEKLY  =  72 hours;  // 3 days
uint256 public constant GRACE_PERIOD_MONTHLY = 240 hours;  // 10 days
uint256 public constant GRACE_PERIOD         = 240 hours;  // kept as alias; overridden per-frequency at startCircle
```

**Change 2 — Set grace period per-frequency in `startCircle()`:**

After `c.status = CircleStatus.ACTIVE;` and before `c.startTime = block.timestamp;`, add:
```solidity
if (c.frequency == Frequency.DAILY) {
    c.gracePeriod = GRACE_PERIOD_DAILY;
} else if (c.frequency == Frequency.WEEKLY) {
    c.gracePeriod = GRACE_PERIOD_WEEKLY;
} else {
    c.gracePeriod = GRACE_PERIOD_MONTHLY;
}
```

**Change 3 — Remove period-0 special case in `_periodDeadline()`:**

```solidity
// REMOVE these two lines entirely:
if (periodIndex == 0) return startTime;
```

The three frequency branches already handle `periodIndex == 0` correctly once the special case is removed:
- `DAILY`: `startTime + 0 * 1 days = startTime` — wait, this still returns `startTime` for period 0. We need `periodIndex + 1` for all periods, or change the formula.

Actually the cleanest fix is: periods are 1-indexed in the deadline formula. Replace `uint256(periodIndex)` with `uint256(periodIndex) + 1` in each branch, so period 0 gets interval 1, period 1 gets interval 2, etc.

**Revised `_periodDeadline`:**
```solidity
function _periodDeadline(
    uint256 startTime,
    Frequency frequency,
    uint8 weekday,
    uint8 anchorDay,
    uint8 periodIndex
) internal pure returns (uint256) {
    // No special case for period 0. Every period gets a full contribution window.
    // Use periodIndex+1 as the interval offset so period 0 = 1 interval, period 1 = 2 intervals, etc.
    uint256 n = uint256(periodIndex) + 1;

    if (frequency == Frequency.DAILY) {
        return startTime + n * 1 days;
    }
    if (frequency == Frequency.WEEKLY) {
        return _weekdayAnchor(startTime, weekday) + n * 7 days;
    }
    return _monthlyDeadline(startTime, anchorDay, uint8(n));
}
```

Note: `_monthlyDeadline` already handles `periodIndex == 0` as a special case returning `startTime` — update it to remove that too, or just pass `n` (which is always ≥ 1) and it works correctly.

### Tests — update `_createAndActivate3` and helpers

All test helpers that warp time to `startTime + GRACE_PERIOD + 1` to pass `finalizePeriod` need updating: the deadline is now `startTime + interval` (not `startTime`), and grace is per-frequency. For WEEKLY tests: deadline = `_weekdayAnchor(startTime, weekday) + 7 days`, grace = 72h. For MONTHLY: deadline = first monthly anchor, grace = 240h. Update helpers accordingly.

New tests to add:
1. `test_period0_dailyHasRealDeadline` — period 0 deadline = startTime + 1 day for DAILY
2. `test_period0_weeklyHasRealDeadline` — period 0 deadline = weekdayAnchor + 7 days for WEEKLY
3. `test_period0_monthlyHasRealDeadline` — period 0 deadline = first anchorDay occurrence for MONTHLY
4. `test_gracePeriod_daily` — circle.gracePeriod == 12 hours for DAILY
5. `test_gracePeriod_weekly` — circle.gracePeriod == 72 hours for WEEKLY
6. `test_gracePeriod_monthly` — circle.gracePeriod == 240 hours for MONTHLY
7. `test_finalizePeriod_revertsBeforeGraceExpiry` — calling finalizePeriod before deadline + grace reverts
8. `test_finalizePeriod_succeedsAfterGraceExpiry` — succeeds after deadline + grace

### Frontend changes

**`CurrentPeriod.tsx`** — fix `canFinalize`:
```ts
// BEFORE:
const canFinalize = (() => {
  if (!deadlinePast) return false
  ...
})()

// AFTER: require grace period to have expired
// gracePeriod comes from circle data (c.gracePeriod as bigint)
const gracePeriod = circleRaw?.[0]?.gracePeriod as bigint ?? 240n * 3600n
const graceExpiry = deadline + gracePeriod // both in seconds as bigint
const graceExpired = BigInt(Math.floor(Date.now() / 1000)) > graceExpiry
const canFinalize = graceExpired && !!participants
```

**`PeriodTimeline.tsx`** — show "Scheduled" for future uninitiated periods in ACTIVE circles:
```ts
// For periods > currentPeriod in an ACTIVE circle where pd is null:
// Compute expected deadline on the frontend using the same formula
// Show: "Scheduled — opens when period [n] is finalized"
// Show expected deadline computed from startTime + (n+1) * interval
```

**`CreateCircleForm.tsx`** — Add:
1. Grace period callout on Step 1 (Schedule): per-frequency text showing the grace period
2. Schedule preview on Step 4 (Review): table of all N periods with position, recipient (truncated), expected deadline, grace expiry

**`src/lib/schedule.ts`** — New utility file: `computeDeadline(startTime, frequency, weekday, anchorDay, periodIndex)` — mirrors `_periodDeadline` in TypeScript for the frontend preview. Also exports `GRACE_PERIOD_BY_FREQUENCY`.

### Deployment
- `forge build` → `forge test` → deploy → new CA → update `contract-metadata/AdasheCircle.json`, `contract.ts`, `.env`, `AGENTS.md`

Switch to Build mode to execute all of this.
