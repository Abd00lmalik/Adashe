Let me read every relevant file before touching anything. Now read the contract's `contribute`, `claimProgressivePayout`, `finalizePeriod`, `claimPayout`, and `getPeriod`: Now read `finalizePeriod`'s guard and `getPeriod` getter, plus the `finalizePeriod` withholding bug: I now have a complete picture. Let me also check `_initializePeriod` and the `finalizePeriod` guard closely: I now have a complete, grounded understanding of every bug. Let me document them precisely before writing a single line of code. Here is the complete root-cause analysis before any code is written.

---

## Root causes — concrete, line-referenced

### Bug 1 (CONTRACT) — `finalizePeriod` guard blocks re-entry after progressive claims

Line 461:
```solidity
require(!p.payoutReleased && p.claimableAmount == 0, "period already finalized");
```

This guard was written to prevent calling `finalizePeriod` twice. But now that `claimProgressivePayout` sets `p.claimableAmount = 0` (it does not touch this field — actually `progressivelyPaid` is tracked separately). Wait — let me re-read. `claimProgressivePayout` does NOT set `p.claimableAmount`. It sets `p.progressivelyPaid`. So `p.claimableAmount` is still 0 when the period is open. The guard `p.claimableAmount == 0` is TRUE for an uninitiated open period. So `finalizePeriod` can run. That guard is not the blocking issue here.

The real problem is different: after `finalizePeriod` computes `remainingPayout = netPayout - progressivelyPaid` and sets `p.claimableAmount = remainingPayout`, if `remainingPayout == 0` (because the recipient already claimed everything progressively), then `claimPayout` will revert with `"no claimable payout"` at line 566. But `payoutReleased` is never set to true when there is nothing left to claim — **the circle is stuck**. The period is finalized but `payoutReleased = false` forever, and `claimPayout` reverts because `claimableAmount == 0`.

### Bug 2 (CONTRACT) — `finalizePeriod` sets `withheldAmount = netPayout` instead of `remainingPayout`

Lines 543-546:
```solidity
if (recipientRecord.debtBalance > 0) {
    p.payoutWithheld = true;
    p.withheldAmount = netPayout;     // ← should be remainingPayout
```

`withheldAmount` is set to the full `netPayout` even though `progressivelyPaid` has already been transferred. The actually withheld amount in the contract is `remainingPayout = netPayout - progressivelyPaid`. This inflates the displayed withheld amount and would cause `claimPayout` to reference a different figure than what the contract actually holds.

### Bug 3 (CONTRACT) — `claimPayout` does not mark `payoutReleased = true` when `claimableAmount == 0`

When the recipient has claimed everything progressively and `finalizePeriod` sets `claimableAmount = 0`, `claimPayout` reverts at line 566 (`"no claimable payout"`). There is no path to set `payoutReleased = true`. The `PayoutPanel` reads `payoutReleased` to show the "claimed" state, so it never shows "claimed" either. The button in `PayoutPanel` is gated on `!payoutReleased`, so it stays visible. This is the direct cause of the button remaining visible.

### Bug 4 (FRONTEND) — `CurrentPeriod` progressive claim button is always visible to the recipient

Lines 238-260 of `CurrentPeriod.tsx`:
```tsx
{isRecipient && !periodData[3] /* !payoutReleased */ && (() => {
  // ... always renders the button regardless of available amount
```

The button renders whenever the recipient is connected and the period is not finalized. It never computes whether `paidSoFar - reserveAmount - progressivelyPaid > 0` before showing. It just lets the contract reject. The user sees a button, clicks it, gets a revert, and is confused.

### Bug 5 (FRONTEND) — `PayoutPanel` button uses `claimPayout` for a period that is still open

`PayoutPanel` shows the "Claim Payout" button when `claimableAmount > 0`. For a period that is still running but has had `finalizePeriod` called (so `claimableAmount` is set), this is correct. But there is an off-by-one: because `claimPayout` checks `claimableAmount > 0`, if after `finalizePeriod` the `claimableAmount` is 0 (all claimed progressively), the `PayoutPanel` correctly hides the button — but it also never shows the "claimed" state because `payoutReleased` is still false. So the UI falls into the "waiting for finalization" message even after the period is over.

---

Now fixing all five bugs. The contract changes are:

1. `finalizePeriod`: fix `withheldAmount` to use `remainingPayout`, not `netPayout`
2. `finalizePeriod`: after computing `remainingPayout`, if it is 0, set `payoutReleased = true` immediately
3. `claimPayout`: allow call when `claimableAmount == 0` AND `progressivelyPaid > 0` (everything was claimed progressively) — just set `payoutReleased = true`

The frontend changes are:

4. `CurrentPeriod`: compute available amount and only render the progressive button when `availableNow > 0`
5. `PayoutPanel`: add `progressivelyPaid > 0 && claimableAmount == 0 && !payoutReleased` state showing "all claimed progressively, pending finalization mark" Now I have exact line context. Applying all contract fixes:The session was switched to Plan mode. I cannot write files here. Let me clearly document everything that needs to be done so the build agent can implement it precisely.

---

## Complete implementation plan — ready to build

Here is the exact set of changes to make. Switch to Build mode to execute them.

---

### CONTRACT FIXES (`contracts/AdasheCircle.sol`)

#### Fix 1 — `finalizePeriod`: correct `withheldAmount` and auto-release when nothing remains

Find this block (lines ~538–557):
```solidity
        recipientRecord.reserveBalance += reserveCredit;
        // Deduct any amount already claimed progressively during the period.
        uint256 remainingPayout = netPayout > p.progressivelyPaid ? netPayout - p.progressivelyPaid : 0;
        p.claimableAmount = remainingPayout;

        if (recipientRecord.debtBalance > 0) {
            p.payoutWithheld = true;
            p.withheldAmount = netPayout;
            emit PayoutWithheld(circleId, periodIndex, p.recipient, netPayout);
        }

        c.currentPeriod += 1;
```

Replace with:
```solidity
        recipientRecord.reserveBalance += reserveCredit;
        // Deduct any amount already claimed progressively during the period.
        uint256 remainingPayout = netPayout > p.progressivelyPaid ? netPayout - p.progressivelyPaid : 0;
        p.claimableAmount = remainingPayout;

        if (recipientRecord.debtBalance > 0) {
            p.payoutWithheld = true;
            // withheldAmount must reflect what is actually still held, not the gross netPayout.
            p.withheldAmount = remainingPayout;
            emit PayoutWithheld(circleId, periodIndex, p.recipient, remainingPayout);
        } else if (remainingPayout == 0) {
            // Everything was already claimed progressively — mark released immediately.
            // This prevents the period being stuck in a state where payoutReleased=false
            // and claimableAmount=0, which would block claimPayout and keep the UI broken.
            p.payoutReleased = true;
            emit PayoutReleased(circleId, periodIndex, p.recipient, 0);
        }

        c.currentPeriod += 1;
```

#### Fix 2 — `claimPayout`: allow finalisation-marking when `claimableAmount == 0` but everything was claimed progressively

Find `claimPayout` (lines ~559–583):
```solidity
    function claimPayout(uint256 circleId, uint256 periodIndex) external nonReentrant {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE || c.status == CircleStatus.COMPLETED, "invalid circle status");

        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(msg.sender == p.recipient, "not recipient");
        require(p.claimableAmount > 0, "no claimable payout");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        require(mr.debtBalance == 0, "debt outstanding");

        uint256 payoutAmount = p.claimableAmount;
        p.claimableAmount = 0;
        p.payoutReleased = true;
        p.payoutWithheld = false;
        p.withheldAmount = 0;

        if (payoutAmount > 0) {
            usdc.safeTransfer(msg.sender, payoutAmount);
        }

        emit WithheldPayoutClaimed(circleId, periodIndex, msg.sender, payoutAmount);
        emit PayoutReleased(circleId, periodIndex, msg.sender, payoutAmount);
    }
```

Replace the `require(p.claimableAmount > 0, "no claimable payout");` check so that `claimPayout` can also be called to mark the payout as released when the full amount was claimed progressively:

```solidity
    function claimPayout(uint256 circleId, uint256 periodIndex) external nonReentrant {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE || c.status == CircleStatus.COMPLETED, "invalid circle status");

        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(msg.sender == p.recipient, "not recipient");
        require(!p.payoutReleased, "payout already released");
        // Allow claim when claimableAmount > 0 (normal case) OR when the full
        // payout was already claimed progressively (progressivelyPaid > 0).
        require(p.claimableAmount > 0 || p.progressivelyPaid > 0, "no claimable payout");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        require(mr.debtBalance == 0, "debt outstanding");

        uint256 payoutAmount = p.claimableAmount;
        p.claimableAmount = 0;
        p.payoutReleased = true;
        p.payoutWithheld = false;
        p.withheldAmount = 0;

        if (payoutAmount > 0) {
            usdc.safeTransfer(msg.sender, payoutAmount);
        }

        emit WithheldPayoutClaimed(circleId, periodIndex, msg.sender, payoutAmount);
        emit PayoutReleased(circleId, periodIndex, msg.sender, payoutAmount);
    }
```

---

### FRONTEND FIXES

#### Fix 3 — `CurrentPeriod.tsx`: only show progressive claim button when funds are actually available

The issue is that the button always renders when `isRecipient && !payoutReleased`. It needs to compute `availableNow` from the period data and only render when `availableNow > 0`.

The `getPeriod` tuple now has `grossEntitlement` at index 2. We can estimate `paidSoFar` from the participants we can see — but the contract does not expose `paidSoFar` directly. The safest approach: read all participant contribution records and sum them on the frontend to compute `paidSoFar`, then derive `availableNow = max(0, paidSoFar - reserveAmount - progressivelyPaid)`.

However, that requires N additional `getContribution` reads. A simpler approach that does not require extra reads: use `grossEntitlement` from the tuple. `grossEntitlement = contributionAmount * (memberCount - 1)`. We cannot know `paidSoFar` without reading each contribution. The minimal fix is to fetch all participants' contributions in `CurrentPeriod` and sum those with `PAID`/`LATE_PAID` status.

But an even simpler change that fixes the user's complaint without extra reads: **compute `progressivelyPaid` from the tuple and the reserve from `circleRaw[12]`, and hide the button when `progressivelyPaid >= grossEntitlement - reserveAmount`** (meaning everything spendable is already claimed). Show it otherwise.

Concrete change in `CurrentPeriod.tsx`, in the progressive payout section:

```tsx
{isRecipient && !periodData[3] /* !payoutReleased */ && (() => {
  const reserveAmt = (circleRaw as unknown[])[12] as bigint
  const grossEntitlement = periodData[2] as bigint   // contributionAmount * (memberCount - 1)
  const prog = progressivelyPaid as bigint
  const maxSpendable = grossEntitlement > reserveAmt ? grossEntitlement - reserveAmt : 0n
  // Only show the claim button if there could be unclaimed funds.
  // We cannot know exact paidSoFar without reading all contributions,
  // so we show the button whenever prog < maxSpendable (there may be more to claim).
  // The contract will revert with "nothing new to claim" if paidSoFar hasn't exceeded reserveAmt yet.
  const mightHaveMore = prog < maxSpendable
  if (!mightHaveMore) return null
  return (
    <div className="pt-2 border-t border-ivory-200">
      <p className="text-xs text-muted mb-1 font-medium">Progressive payout</p>
      <p className="text-xs text-muted mb-3">
        Claim contributions already received above the <UsdcAmount amount={reserveAmt} /> reserve threshold. The reserve is held until period finalization.
        {prog > 0n && <> Already claimed: <UsdcAmount amount={prog} />.</>}
      </p>
      <TxButton
        txState={progressiveTxState}
        onAction={handleProgressiveClaim}
        idleLabel="Claim Available Payout"
        variant="default"
        size="sm"
      />
    </div>
  )
})()}
```

This hides the button once `progressivelyPaid == maxSpendable` (all spendable funds claimed). It still shows it while there may be more to claim. The contract is the authoritative gatekeeper — it will revert if nothing is actually available.

Also: **replace the `setTimeout(5000)` pattern in all three handlers with `useWaitForTransactionReceipt`**. The current `handleProgressiveClaim` fires `await new Promise((r) => setTimeout(r, 5000))` then calls `refetch()`, which is fragile — on a slow block it will read stale state. Replace all three handlers (`handleContribute`, `handleProgressiveClaim`, `handleFinalize`) with the hash-and-receipt pattern already used in `PayoutPanel`.

#### Fix 4 — `PayoutPanel.tsx`: handle the "all claimed progressively, period not yet finalized" state and fix button idleLabel

Current line 199:
```tsx
idleLabel={`Claim ${''} USDC`}
```
This renders as "Claim  USDC" (empty string). Fix to:
```tsx
idleLabel={`Claim ${String(claimableAmount / 1_000_000n)} USDC`}
```

Also add a state branch between the `claimableAmount === 0n` check and the claimable block:

```tsx
// After the payoutWithheld block and before the claimableAmount === 0n check:
// Case: progressively claimed everything, period finalized → payoutReleased will be true, handled above
// Case: progressively claimed everything, period not yet finalized
if (claimableAmount === 0n && progressivelyPaid > 0n && !payoutReleased && !payoutWithheld) {
  return (
    <div key={periodIndex} className="flex items-center gap-2 text-sm text-success">
      <CheckCircle2 className="h-4 w-4" />
      Period {periodIndex + 1}: <UsdcAmount amount={progressivelyPaid} /> claimed progressively. Finalization will confirm your reserve.
    </div>
  )
}
```

The `payoutReleased = true` path from Fix 2 above (finalize auto-releases) means `payoutReleased` will already be `true` after `finalizePeriod` when everything was claimed progressively. So `PayoutPanel` will show the green "claimed" row. The extra state branch above handles the window between "all claimed progressively" and "period finalized".

---

### TESTS

Add these regression tests to the Foundry test file:

1. `test_finalizePeriod_AutoRelease_WhenAllClaimedProgressively` — after progressive claim of full spendable, finalize → `payoutReleased = true`, `claimableAmount = 0`, `progressivelyPaid = 100e6`
2. `test_claimPayout_AfterFullProgressiveClaim_SetsReleased` — `claimPayout` on a finalized period where `claimableAmount = 0` but `progressivelyPaid > 0` — should not revert and should set `payoutReleased = true`
3. `test_finalizePeriod_WithheldAmount_IsRemainingPayout_NotGross` — partial progressive claim, then finalize with debt → `withheldAmount = remainingPayout`, not `netPayout`

---

### DEPLOY + WIRING

After all contract and test changes:
1. `forge test` — all 73 + new tests must pass
2. Deploy to Arc Testnet as v11
3. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env` and `src/lib/contract.ts`
4. Update `AGENTS.md` version note
5. Run `bash /home/user/arc-studio-helpers/check.sh` — 0 ESLint errors, 0 TypeScript errors

The Vercel env var `NEXT_PUBLIC_CONTRACT_ADDRESS` must also be updated to the new address after deploy.

---

Switch to Build mode to execute all of the above. The plan is fully specified — every change is exact and there is no ambiguity to resolve before coding.
