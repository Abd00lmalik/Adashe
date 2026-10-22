Reading the full contract before anything else. Now read the `_initializePeriod` and `PayoutPanel` frontend: Now I have the complete picture. Let me check what `getPeriod` actually returns in the ABI: Now I have the complete picture. Let me also check what `getPeriod` returns in the Solidity source: I now have a complete, grounded diagnosis. Let me also check what reserve routing the bug report requests vs what's in the contract: Now I have everything I need for a complete, grounded diagnosis.

---

**Complete root cause analysis:**

**Bug 1 — Why `claimPayout` appears to fail (the primary issue):**

The `claimablePeriods` filter in `PayoutPanel.tsx` line 39–49 only shows a "Claim Payout" button when `!payoutReleased && !payoutWithheld`. But `PayoutPanel` doesn't have access to `claimableAmount` from the contract — `getPeriod` does NOT return `claimableAmount` (it returns `withheldAmount` at index 5, then `participants` at index 6). So the panel cannot determine whether the payout is actually claimable vs just not-yet-finalized. The `handleClaim` at line 61 also sets `success` immediately without waiting for the receipt — if the tx reverts (e.g. `debt outstanding`), the error is caught and shown, but there's no receipt confirmation.

**Bug 2 — `finalizePeriod` sets `p.claimableAmount = netPayout` but `getPeriod` doesn't return it** (line 811–815 of the contract). The frontend cannot read `claimableAmount` from the contract — it's stored in `_periods` as a field but not included in the `getPeriod` getter. The `claimPayout` function requires `p.claimableAmount > 0` to succeed (line 518). If `netPayout = 0` (because all contributions went to the reserve: `reserveCredit = min(reserveAmount, totalCollected) = totalCollected` when `totalCollected ≤ reserveAmount`), then `claimPayout` will revert "no claimable payout".

**The critical accounting bug:** For a 5-member circle with `contributionAmount = 250 USDC`, `reserveAmount = 250 USDC` (set as `c.reserveAmount = contributionAmount` in `createCircle`), and `grossEntitlement = 250 * 4 = 1000 USDC`: `reserveCredit = min(250, 1000) = 250`, `netPayout = 1000 - 250 = 750 USDC`. This is correct — the recipient gets 750 USDC and their `reserveBalance` gets 250 USDC. **This part works correctly.**

**But:** The `PayoutPanel` line 42–43 destructures `getPeriod` result incorrectly:
```ts
const [recipient, , , payoutReleased, payoutWithheld, , claimableAmount] =
  pd.result as [string, bigint, bigint, boolean, boolean, bigint, ...unknown[]]
```
Index 6 is `participants` (an `address[]`), not `claimableAmount`. The comment on line 44 even admits this: "claimableAmount is NOT returned by getPeriod". So `claimableAmount` is actually the `participants` array. The `payoutWithheld` check then runs incorrectly.

**Bug 3 — `handleClaim` sets success immediately** (line 61: `setTxState({ status: 'success', hash })` without awaiting receipt). If the tx reverts, the error is caught in the catch block — but if the tx succeeds, the `refetch()` on line 63 may return stale data.

**The reserve routing request from the bug report** (first contribution → reserve, subsequent → payout) conflicts with the existing contract model. The existing model withholds from the recipient's payout, not from individual contributor contributions. The bug report may be describing the intent, but the current contract has a valid alternative model. I will not change the reserve model — it's correct per `init.md` section 6.

**Fixes needed:**

1. Add `claimableAmount` to `getPeriod` getter in the contract (requires redeployment)
2. Fix `PayoutPanel` destructuring to use `claimableAmount` correctly
3. Fix `handleClaim` to wait for receipt before showing success
4. Show the actual claimable amount in the UI

**Migration risk:** Redeployment resets `_nextCircleId` to 1. Existing circles on the current contract (`0xdfbb49541cea68d90c75ecfaf43574ee690a9740`) will continue to work under that address. The app switches to the new contract for new circles only.

Proceeding: I need to switch to Build mode. Here is the complete build specification:

---

## Build specification: getPeriod + claimableAmount + PayoutPanel fixes

### Contract change (minimal, safe)

**`contracts/AdasheCircle.sol` — add `claimableAmount` to `getPeriod` return values:**

In `getPeriod`, add `uint256 claimableAmount` as the 7th output (between `withheldAmount` and `participants`), returning `p.claimableAmount`. No other changes.

**This requires redeployment.** Existing circles on `0xdfbb49541cea68d90c75ecfaf43574ee690a9740` are unaffected — they continue to operate on that contract. New circles use the new contract.

### Test updates

The `getPeriod` return tuple changes from 7 to 8 elements. Any test that destructures `getPeriod` results needs to add the `claimableAmount` field at index 6 (between `withheldAmount` and `participants`).

### Frontend fixes

**`src/components/circle/PayoutPanel.tsx`:**
1. Fix destructuring of `getPeriod` result — add `claimableAmount` at index 6
2. Use `claimableAmount > 0n` as the condition for showing "Claim Payout"
3. Show the actual claimable amount in the UI
4. Fix `handleClaim` — add `useWaitForTransactionReceipt` and `useQueryClient`; set success only after receipt confirms
5. Show amount in the "Claim Payout" button label

**`src/components/circle/PeriodTimeline.tsx`:**
Same destructuring fix — add `claimableAmount` at index 6.

**`src/components/circle/CurrentPeriod.tsx`:**
Same destructuring fix — add `claimableAmount` at index 6 in the `getPeriod` tuple.

**`src/lib/schedule.ts`** and any other file that destructures `getPeriod` results — same fix.

### ABI update

After `forge build`, the deploy tool updates `contracts/contract-metadata/AdasheCircle.json`. The `getPeriod` function in the ABI gains a new output `claimableAmount` at index 6. Update `src/lib/contract.ts` address fallback and `.env`.

Switch to Build mode to execute.
