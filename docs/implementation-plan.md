Reading the full current file first — I will not edit what I have not read: I have the full file. Now I understand exactly what to change. The plan from the previous turn is confirmed — the `maxSpendable` upper-bound approach is on lines 202–217. I need to:

1. Add a `useReadContracts` for all non-recipient participants' `getContribution` records
2. Sum `paidSoFar` from those records
3. Replace `maxSpendable - effectiveProgressivelyClaimed` with `paidSoFar - reserveAmount - effectiveProgressivelyClaimed`
4. Update the optimistic `setLocalProgressivelyClaimed` to use `exactAvailableNow` rather than `maxSpendable`
5. Call `refetchContribs()` in all three receipt effects

Also need to check what `getContribution` returns structurally — need to confirm the ContributionStatus enum values: I have everything I need. `ContributionStatus`: `PENDING=0, PAID=1, LATE_PAID=2, DEFAULTED=3, COVERED_BY_RESERVE=4`. `getContribution` returns a `ContributionRecord` struct which has `status` and `paidAmount`.

Now I have the complete file contents and can make the precise surgical edit. Here is exactly what changes:

1. After line 46 (`query: { staleTime: 0, refetchOnMount: true }`) — add a second `useReadContracts` for participant contributions, enabled only when `periodData` is ready and participants > 0
2. Lines 196–217 — replace the `maxSpendable` upper-bound block with exact `paidSoFar`-based math
3. Lines 127–131 — update the optimistic `setLocalProgressivelyClaimed` to use `exactAvailableNow` instead of `maxSpendable`
4. Lines 96, 110, 133 — add `refetchContribs()` calls alongside existing `refetch()` callsThe session is in Plan mode. I cannot edit files here. Please switch to **Build mode** using the mode selector at the top of the screen, then come back and say "build" and I will execute all the changes immediately.

The complete implementation is fully specified — here is a precise summary of what will happen the moment Build mode is active:

---

## What will be built (no ambiguity)

**One file changed: `src/components/circle/CurrentPeriod.tsx`**

**Change A — Add participant contribution reads (after line 56, after the existing `useReadContracts`)**

Add a second `useReadContracts` that reads `getContribution` for every non-recipient participant in `periodData[8]`. Enabled only when `nonRecipientParticipants.length > 0`. Sum `PAID` (status=1) and `LATE_PAID` (status=2) amounts into `paidSoFar: bigint`.

**Change B — Replace upper-bound gating with exact math (lines 196–217)**

Replace:
```ts
const maxSpendable = grossEntitlement > reserveAmount ? grossEntitlement - reserveAmount : 0n
const progressiveAvailableNow = maxSpendable > effectiveProgressivelyClaimed ? maxSpendable - effectiveProgressivelyClaimed : 0n
const canClaimProgressively = isRecipient && !payoutReleased && progressiveAvailableNow > 0n
```

With:
```ts
// Exact: what contributors have actually paid minus the reserve threshold minus already claimed
const exactSpendable = paidSoFar > reserveAmount ? paidSoFar - reserveAmount : 0n
const exactAvailableNow = exactSpendable > effectiveProgressivelyClaimed ? exactSpendable - effectiveProgressivelyClaimed : 0n
const canClaimProgressively = isRecipient && !payoutReleased && exactAvailableNow > 0n
```

**Change C — Fix optimistic hide (line 127–131)**

Replace the functional update that sets `localProgressivelyClaimed` to `maxSpendable` with one that sets it to `effectiveProgressivelyClaimed + exactAvailableNow` — i.e. exactly what was just claimed, not the theoretical maximum.

**Change D — Call `refetchContribs()` in all three receipt effects (lines 96, 110, 133)**

Add `refetchContribs()` alongside `refetch()` so the paidSoFar sum stays fresh after every confirmed transaction.

**No contract changes. No deploy. No other files.**
