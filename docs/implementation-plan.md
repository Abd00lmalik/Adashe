Reading the relevant contract sections carefully before saying anything about the design. Now read `contribute` and `_initializePeriod`: I have read enough. Now I have a complete, grounded understanding of the entire system. Here is the engineering discussion you asked for.

---

## How the existing payout and reserve mechanisms actually work

### The contribution lifecycle (what the contract does today)

When a member calls `contribute()`, the contract:
1. Verifies they are a participant, not the recipient, not already settled, and within the deadline + grace window
2. Calls `usdc.safeTransferFrom(msg.sender, address(this), c.contributionAmount)` — funds move to the contract's escrow
3. Records the contribution in `p.contributions[member]` with `status = PAID` or `LATE_PAID`
4. That is all — no payout happens at contribution time

The USDC sits in the contract. Nothing more happens until `finalizePeriod()` is called.

### What finalizePeriod does (the only place a payout becomes available)

`finalizePeriod()` runs after all contributors' final deadlines (deadline + grace period) have passed. It:
1. Loops over all participants, tallying `totalCollected`
2. For each defaulter, applies their reserve to cover the shortfall if available
3. Computes `reserveCredit = min(c.reserveAmount, totalCollected)` — this funds the recipient's individual reserve
4. Computes `netPayout = totalCollected - reserveCredit` — this is the recipient's spendable payout
5. Credits `recipientRecord.reserveBalance += reserveCredit` (the recipient's reserve grows)
6. Sets `p.claimableAmount = netPayout` — now claimable
7. If recipient has outstanding debt, withholds the payout (`p.payoutWithheld = true`)

The recipient then calls `claimPayout()` to receive `netPayout` USDC transferred to their wallet.

### Why payout availability currently depends on period finalization

There are three structural reasons, all in the contract:

**Reason 1 — Defaulter detection:** The reserve-coverage logic runs at `finalizePeriod`. The contract cannot know whether a contributor will pay or default until their final deadline (which includes the grace period) has passed. Only then can it know the actual `totalCollected` and apply reserve coverage for defaulters.

**Reason 2 — Reserve calculation:** `reserveCredit = min(c.reserveAmount, totalCollected)` depends on `totalCollected`, which is only known after all contributions are resolved.

**Reason 3 — Payout withholding:** If the recipient has outstanding debt from a prior period, their payout must be withheld. This check happens at finalization.

### The reserve's actual purpose

The recipient's individual reserve (`reserveCredit = c.contributionAmount = 250 USDC` for a 5-member circle) is withheld from the recipient's payout at finalization. It serves as collateral for the recipient's future contribution obligations. If they miss a later contribution, `finalizePeriod` of that later period consumes their `reserveBalance` to cover the shortfall. This protects the group.

---

## What your proposed change requires

You want: as soon as each contribution arrives, route it progressively to the recipient — first contribution goes into their reserve, subsequent contributions go to their wallet immediately.

Let me be concrete about what this means in the 4-member, 5 USDC example:
- B contributes → 5 USDC into recipient A's `reserveBalance` on-chain
- C contributes → 5 USDC transferred to A's wallet immediately
- D contributes → 5 USDC transferred to A's wallet immediately
- A receives 10 USDC in wallet, 5 USDC in reserve. Total 15 USDC accounted for.

### The accounting tension this creates

This is the core problem I need to discuss with you before recommending an approach.

Under the current model, `reserveCredit = min(c.reserveAmount, totalCollected)`. For a full period with 3 contributions of 5 USDC each: `totalCollected = 15`, `reserveCredit = 5`, `netPayout = 10`. That is the intended result — A's wallet receives 10, reserve receives 5.

Under your proposed model, the same 15 USDC flows through the same destinations: 5 to reserve, 10 to wallet. **The amounts are identical.** The only difference is timing — the wallet transfers happen during the period rather than at finalization.

But the problem arises when someone defaults. Suppose only B and C contribute:
- B contributes → 5 USDC into A's reserve
- C contributes → 5 USDC transferred to A's wallet immediately
- D defaults

At finalization, `totalCollected = 10` (B + C's contributions plus any reserve coverage for D). The intended `netPayout = 10 - 5 = 5`. But A has already received **5 USDC** from C's contribution. The contract would need to know that 5 USDC has already been paid out and not pay it again. This means `p.progressivelyPaid` needs to be tracked, and `finalizePeriod` would compute `remainingPayout = netPayout - alreadyPaid`.

If D's reserve covers their default: `totalCollected = 15`, `reserveCredit = 5`, `netPayout = 10`. A already received 5, so `finalizePeriod` releases 5 more.

If D defaults with no reserve: `totalCollected = 10`, `reserveCredit = 5`, `netPayout = 5`. A already received 5, `remainingPayout = 0`. No additional transfer.

This is manageable but requires tracking `p.progressivelyPaid` as a new field.

### The deeper tension: when is the reserve funded?

Your proposed model funds the reserve from B's contribution — the **first** contribution to arrive. But B's contribution arriving first is not guaranteed. What if C pays first and B pays second? Or if B pays and C defaults?

The current model sidesteps this by computing the reserve from `totalCollected` at finalization, which is always deterministic. Your model ties the reserve to contribution arrival order, which is non-deterministic in time and subject to concurrent transactions.

---

## Implementation options

### Option A: Progressive release via a new `claimProgressivePayout` function (recommended)

Add a `claimProgressivePayout(circleId, periodIndex)` function that:
1. Can be called by the recipient at any time during an active period (before `finalizePeriod`)
2. Computes how much is safely releasable: `paid_so_far - reserveAmount` — the amount above the reserve threshold
3. Transfers that amount to the recipient and records `p.progressivelyPaid`
4. `finalizePeriod` deducts `p.progressivelyPaid` from `netPayout` before setting `p.claimableAmount`

**How it handles the reserve:** The first `c.reserveAmount` of total contributions is always held back. The recipient can only claim above that threshold. So if 5 USDC have arrived and the reserve is 5 USDC, they can claim 0. When 10 have arrived, they can claim 5. When 15 have arrived, they can claim 10.

**Why this is safe:**
- Exact accounting — `p.progressivelyPaid` tracks every USDC already released
- Default-safe — if contributions fall short, the amount already released is always ≤ actual contributions minus reserve, so the contract never owes more than it holds
- No changes to `finalizePeriod`'s logic — it just subtracts `progressivelyPaid` from `netPayout` before setting `claimableAmount`
- Recipient eligibility (debt check) runs at claim time, not at contribution time — same rule as today

**The one accounting edge case:** If the recipient already has outstanding debt when they try to claim progressively, the claim reverts (same rule as `claimPayout`). This is correct — debt blocks payout.

**What this is NOT:** It is not "first contribution to reserve, rest to wallet" in the way your description implies. The reserve is funded at finalization from `totalCollected`, not from specific individual contributions. The progressive release simply makes the **spendable** portion available earlier. The destination amounts are identical to today; only the timing changes.

### Option B: Direct wallet transfer at contribution time (your described model)

Each contribution after the first is wired directly to the recipient's wallet at `contribute()` time. The first contribution is credited to `p.pendingReserve` in the contract.

**Problems with this approach:**
- The contract transfers USDC out of escrow during `contribute()`, before knowing whether all contributors will pay. If 3 of 4 contributors have paid and the 4th defaults, the correct `netPayout` was 10 USDC but the contract already sent 10. Then at finalization, the defaulter's reserve covers their 5, making `totalCollected = 15` retroactively — the contract now owes 10 but already sent 10. This is correct. But if the defaulter has no reserve, `totalCollected = 10`, `netPayout = 5`, but 10 has already been sent. The contract is 5 short. It would have to claw back 5 from the recipient — which is not possible after a `safeTransfer`.
- **This approach can make the contract insolvent in default scenarios.** It cannot be made safe without fundamental changes to how reserves and defaults work.

**This approach should not be implemented.** It breaks the reserve's protection guarantee under any default scenario.

### Option C: No contract change — frontend-only progressive display

Show the running total of contributions received and let the recipient see how much will be available at finalization. No change to fund timing.

**This solves the UX complaint partially** — the recipient can see money is arriving — but does not give them access to funds until finalization. This is not what you asked for.

---

## My recommendation

**Option A is the correct and safe approach.**

It achieves the goal — the recipient can claim their spendable funds progressively as contributions arrive, without waiting for all deadlines to pass — while preserving all existing financial invariants. The reserve is always held in the contract until finalization. No contribution is counted twice. No default scenario can make the contract insolvent.

The contract change is modest:
- New `Period` field: `uint256 progressivelyPaid`
- New function: `claimProgressivePayout(uint256 circleId, uint256 periodIndex)` — callable any time during the period; releases `max(0, currentTotalPaid - reserveAmount - progressivelyPaid)` to recipient; requires recipient has no outstanding debt
- Modified `finalizePeriod`: `netPayout = totalCollected - reserveCredit - p.progressivelyPaid` when setting `claimableAmount`

---

## The one design decision we need to agree on before implementation

**Should the debt check apply to progressive claims?**

Today, `claimPayout` requires `mr.debtBalance == 0`. If the recipient has outstanding debt from a prior period, their payout is withheld until the debt is settled.

For progressive claims during a live period, two options:

**Option A1 (same rule):** Progressive claim also requires `debtBalance == 0`. If you have any debt from a prior period, you cannot claim progressively until it is cleared. This is consistent, safe, and simple.

**Option A2 (allow partial progressive release up to debt amount):** The recipient can claim, but the claimed amount is immediately applied against their outstanding debt rather than sent to their wallet. Complex, changes the debt-settlement flow significantly.

**My recommendation: Option A1.** Keep the rule consistent — debt blocks all payouts including progressive ones. It is simpler, safer, and aligned with the existing principle that debt is the member's obligation to clear before receiving funds.

Please confirm this, and also confirm whether you want the first `c.reserveAmount` to always be held back in the contract until finalization (my recommendation — it preserves the reserve's protective function), or whether you want the reserve to be immediately credited to `recipientRecord.reserveBalance` as contributions arrive (which would mean the recipient's reserve is available to them during the period, reducing the protection it provides).
