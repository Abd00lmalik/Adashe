# AdasheCircle — Security Review Report

**Date:** 2026-10-17  
**Contract:** `contracts/AdasheCircle.sol`  
**Chain:** Arc Testnet (Chain ID 5042002)  
**Deployed:** `0xf230a4353bf45b2d43f79d1803868ad8c8e49018`  
**Review depth:** Maximum (Critical + High + Medium + Low)

---

## Summary

6 findings were identified and fixed before deployment. 0 unresolved findings remain.

| Severity | Found | Fixed | Remaining |
|---|---|---|---|
| Critical | 2 | 2 | 0 |
| High | 3 | 3 | 0 |
| Medium | 1 | 1 | 0 |

Slither static analysis: 0 High, 7 Medium (all false positives in calendar date arithmetic — suppressed with inline disable comments).

Unit tests: 41/41 pass, including fuzz and reentrancy.

---

## Findings Fixed

### [Critical] executeReplacement — missing access control
`executeReplacement` was callable by any address once a replacement was approved, allowing a third party to force execution at an adversarial time (e.g. mid-period, just before finalization). Fixed by adding `require(msg.sender == circles[circleId].creator)` as the first gate.

### [Critical] Push-based payout in finalizePeriod — potential permanent freeze on Arc
`finalizePeriod` directly pushed USDC to the recipient. On Arc, a USDC transfer to a blocklisted address reverts, which would permanently prevent period advancement and lock all members' funds. Fixed by converting to a pull model: `finalizePeriod` records `claimableAmount` in the period struct; the recipient calls `claimPayout` separately. Debt check now happens at claim time, not finalize time.

### [High] Weekly weekday ignored in deadline math
The creator-selected weekday was validated at creation but never used; weekly periods were simply `startTime + N*7 days`. Fixed: added `_nextWeekday(fromTimestamp, targetWeekday)` using UTC day-of-week arithmetic. Period 0 stays `startTime`; periods 1+ align to the chosen weekday.

### [High] removePendingMember leaves slot permanently unfillable
Removing a pending member cleared their record but left the payoutOrder slot pointing to their address with no way to assign a new address. The circle would be permanently stuck in PENDING. Fixed: added `reassignPendingSlot(circleId, slotIndex, newAddress)` (creator-only) which overwrites the payoutOrder slot and resets the old member's record, allowing the new address to join and be approved.

### [High] Replacement mid-period can create forced default on outgoing member
Executing a replacement during an active period left no valid contributor for that period's slot — the outgoing member's `approved` flag was cleared and the replacement wasn't in `p.participants`, so both would be treated as defaulters at finalization. Fixed: `executeReplacement` now requires `block.timestamp > _finalDeadlineForCurrentPeriod(circleId)` (or that the current period is already finalized), preventing mid-period execution entirely.

### [Medium] Constructor accepts non-contract token address
The constructor only checked `usdcAddress != address(0)`. A wrong (non-contract) address is immutable and would permanently brick all USDC flows. Fixed: added `require(usdcAddress.code.length > 0, "USDC: not a contract")`.

---

## Slither Analysis

Ran against `contracts/AdasheCircle.sol` with `--filter-paths node_modules`.

All 7 Medium findings are `divide-before-multiply` and `write-after-write` in `_daysFromDate`, `_daysToDate`, and `_nextWeekday`. These are standard Julian Day Number / Gregorian calendar conversion algorithms where divide-then-multiply is the correct integer arithmetic pattern. The variable `L` in `_daysToDate` is a standard scratch variable in this well-known algorithm. All suppressed with `// slither-disable-next-line` at the relevant lines.

No High findings.

---

## Unit Test Results

41 tests, 0 failures, 0 skips.

### Informational notes (not bugs)

1. **2-member circle net payout = 0**: By spec, reserve = 1 contribution, gross = 1 contribution (memberCount-1 = 1), so net = 0. The recipient in a 2-member circle receives nothing via `claimPayout`; their gross is entirely absorbed by the reserve. The funds are returned via `claimReserveRefund` at completion. This is mathematically correct and consistent with the spec.

2. **Partial reserve branch theoretically unreachable**: The branch covering `0 < reserveBalance < contributionAmount` is correct code but unreachable under normal operation since reserve only accumulates in full `contributionAmount` increments. No security risk.

---

## Key Accounting Invariants (verified by tests)

- No payout released to a member with `debtBalance > 0`
- Full payout withheld while debt exists (`claimPayout` reverts with debt)
- Only the defaulter's own reserve covers their missed contribution
- Reserve coverage records both: reserve decreases AND debt increases (no erasure)
- Insufficient reserve: covered amount limited to available balance, remainder is debt
- Other members' reserves are untouched by a peer's default
- Unused reserves returned to owners via `claimReserveRefund` after COMPLETED
- No cancellation after ACTIVE (`status` never decrements)
- Replacement requires outgoing debt == 0
- Replacement cannot execute mid-period
- Allocations cannot exceed contract's actual token balance

---

## Unresolved Risks

**None blocking deployment.** The following are acknowledged design constraints, not defects:

- **2-member circle UX**: Net payout of 0 may surprise users in a 2-member circle. Recommend the frontend warns creators about this when they select memberCount=2.
- **`max` review is not a paid third-party audit**: The review performed here is thorough but not a substitute for an independent professional audit before mainnet deployment with real user funds.
- **Permissionless `finalizePeriod`**: Any address can trigger finalization once all deadlines pass. This is intentional (keeper pattern), but means finalization is not guaranteed to happen on time — the frontend or a cron-style keeper should call it.

---

## Audit Provenance

| Subagent | Dispatched | Files audited | Corpus rules cited |
|---|---|---|---|
| solidity-auditor | yes | 2 | sensitive-mutator-missing-explicit-access-control, insufficient-constructor-parameter-validation |
| functional-auditor | yes | 1 | arc-push-payout-bricking, weekly-weekday-not-enforced, pending-removal-no-replacement-path, replacement-mid-period-can-force-default |
