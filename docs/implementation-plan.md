This is a deep investigation first, then a build. Let me read everything relevant before planning any changes. Now I have all the evidence I need. Let me read the remaining contract section (createCircle has no auto-join for creator) and CreatorPanel remainder: Now let me read the contract's `getPayoutOrder`, `getPeriod`, and `getContribution` getters, plus the `_allApproved` helper: Good — `getPayoutOrder` is in both the source and the ABI. Now let me read lines 750–830 of the contract to see all the getters, `_allApproved`, and check if there's a `storePinHash` function: I now have a complete, grounded picture of all six bugs. Here is the full diagnosis before I write a single line of code:

---

**Bug 1 — Unauthorized wallets can reach the Join button**

Root cause: `JoinPage` shows the PIN field immediately after wallet connection with zero eligibility check. The flow is: connect wallet → enter PIN → verify → show Join button. There is no step that checks `isInPayoutOrder[circleId][wallet]` before offering the PIN field. An unassigned wallet enters the PIN, the `/api/join/verify` route validates the invite token and PIN hash (both correct), returns `{ circleId, verified: true }`, and `circleId` is set in state — which reveals the Join button. The contract's `joinCircle()` then correctly rejects with "not in payout order", but the UI never prevented the user from getting there. The verify API also does not check wallet eligibility against on-chain data.

**Bug 2 — Incorrect PINs pass**

Root cause: In `CreateCircleForm.handleCreate`, the PIN is hashed client-side with `keccak256(toHex(form.pin))` and stored as `pinHash` in the contract. But after the circle is created, the PIN is **never saved to the database** — look at lines 127–132: the `try` block that was supposed to store the PIN to the backend is a stub (empty body with just a comment). So `db.circlePin` has no record for this circle. In `/api/join/verify` line 48–52: when `circlePin` is null (no DB record), it records the attempt as successful and returns `{ verified: true }` regardless of what PIN was entered. Every PIN, including wrong ones, passes because the DB record doesn't exist.

**Bug 3 — Creator must join separately**

Root cause: `createCircle()` in the contract sets up `payoutOrder` and `isInPayoutOrder` mappings but does NOT call `joinCircle()` for the creator. The creator's `MemberRecord` has `joined: false, approved: false` after creation. `_allApproved()` checks `mr.joined && mr.approved` for every address in `payoutOrder` — if the creator is one of them, `startCircle()` will revert "not all members joined" until they explicitly call `joinCircle()`. The fix is: in `createCircle()`, after setting up the payout order, automatically set `joined=true, approved=true` for `msg.sender` if they appear in `payoutOrder`.

**Bug 4 — Invite link not persisted**

Root cause: `CreatorPanel` stores the invite link only in React state (`useState`). On refresh, state resets and the link is gone. The GET endpoint `getCircleInvites` exists and would return existing valid invites, but `CreatorPanel` never calls it on mount — it only calls the POST (create) endpoint when the button is clicked. Fix: on mount, call the GET endpoint first; only show "Generate" if no valid invite exists.

**Bug 5 — PIN never stored to DB after circle creation**

Same as Bug 2. The `handleCreate` function in `CreateCircleForm` has a dead stub at lines 127–132 that was supposed to store the PIN but does nothing. After `createCircle()` confirms, the app needs to: (a) extract the `circleId` from the `CircleCreated` event in the receipt, (b) POST to a `/api/circles/[circleId]/pin` endpoint that stores `keccak256(pin)` as a bcrypt hash (or the raw keccak hash, matching the contract's stored `pinHash`). Currently no PIN is ever stored server-side, so all PIN attempts pass.

**Bug 6 — Contract eligibility check missing from API**

The verify API only checks invite validity and PIN — it never calls the contract to verify `isInPayoutOrder[circleId][wallet]`. This must be added as an on-chain read before returning success.

---

Now building all fixes: Starting with the contract change — auto-join creator if in payout order: I'm in Plan mode. The investigation is complete. Here is the full build plan — approve it and switch to Build mode to execute:

---

## Build Plan: 6-bug fix

### Root causes (grounded)

| # | Bug | Root cause |
|---|-----|------------|
| 1 | Unauthorized wallets reach Join button | `JoinPage` shows PIN field with no eligibility check; wallet not verified against `isInPayoutOrder` before or during PIN verify |
| 2 | Incorrect PINs pass | `CreateCircleForm.handleCreate` never stores the PIN to the DB (lines 127–132 are a dead stub); `verifyPin` API returns success when `circlePin` record is null |
| 3 | Creator must join separately | `createCircle()` sets up `payoutOrder` but never sets `joined=true/approved=true` for the creator if they appear in the order |
| 4 | Invite lost on refresh | `CreatorPanel` stores link only in React state; never calls the GET endpoint on mount to reload existing valid invites |
| 5 | (same as 2) | PIN never persisted post-creation |
| 6 | Verify API no on-chain eligibility check | `/api/join/verify` never reads `isInPayoutOrder` from the contract |

### Contract change (requires redeploy)

In `createCircle()`, after the payout order loop, auto-join creator if their address is in `payoutOrder`:
```solidity
if (isInPayoutOrder[circleId][msg.sender]) {
    MemberRecord storage cr = memberRecords[circleId][msg.sender];
    cr.joined = true;
    cr.approved = true;
    emit MemberJoined(circleId, msg.sender);
    emit MemberApproved(circleId, msg.sender);
}
```

### Files to change

| File | Change |
|------|--------|
| `contracts/AdasheCircle.sol` | Auto-join creator in `createCircle()` if in payout order |
| `contracts/test/AdasheCircle.t.sol` | Add 8 new tests; update `_createAndActivate3` helper (creator now pre-joined) |
| `contracts/contract-metadata/AdasheCircle.json` | Fresh ABI after `forge build` + redeploy |
| `src/lib/contract.ts` | Update address if changed |
| `AGENTS.md` | New contract address |
| `src/components/create/CreateCircleForm.tsx` | After tx confirmed: extract `circleId` from `CircleCreated` event in receipt; POST PIN hash to `/api/circles/[id]/pin` |
| `src/app/api/circles/[circleId]/pin/route.ts` | **New file**: POST handler stores `bcrypt(keccak256(pin))` in `CirclePin` table |
| `src/app/join/[token]/page.tsx` | Add eligibility-check step between wallet-connect and PIN entry; re-check before submitting join tx; wait for tx receipt before showing success |
| `src/app/api/join/verify/route.ts` | Add on-chain `isInPayoutOrder` read via viem `publicClient`; return 403 if wallet not eligible |
| `src/components/circle/CreatorPanel.tsx` | On mount call GET `/api/circles/[cid]/invite`; restore link if valid invite exists; only show Generate if none found |

### Join page new flow

```
1. Resolve token → get circleId (no wallet needed)
2. Connect wallet
3. Check eligibility: read isInPayoutOrder[circleId][wallet] on-chain
   → not eligible: show "This wallet is not assigned to a position in this circle." STOP
   → eligible: proceed
4. Enter PIN → verify (server checks DB + on-chain eligibility again)
   → wrong PIN: show error, stay on PIN step
   → correct: proceed
5. Join transaction → wait for receipt
6. Success only after receipt confirms MemberJoined event
```

### Test additions (Foundry)

1. `test_createCircle_CreatorInPosition1_AutoJoined` — creator in slot 0, auto-joined after create
2. `test_createCircle_CreatorInPosition3_AutoJoined` — creator in slot 2, auto-joined with correct position
3. `test_createCircle_CreatorNotInOrder_NotJoined` — creator not in payout order, no MemberRecord
4. `test_startCircle_CreatorInOrder_OnlyOthersNeedJoin` — 5-member circle, creator in slot 2; other 4 join; startCircle succeeds (5/5)
5. `test_joinCircle_RevertsIfCreatorTriesAgain` — creator already auto-joined; calling joinCircle again reverts "already joined"
6. `test_joinCircle_RevertsIfNotInPayoutOrder` — already exists, keep
7. `test_allApproved_TrueWhenCreatorAutoJoinedAndOthersJoin` — verify _allApproved passes correctly

### Done when

- [ ] `forge test` 59+ pass (52 existing + 7 new)
- [ ] New contract deployed to Arc Testnet; address updated everywhere
- [ ] Creating a circle: PIN saved to DB; circleId extracted from receipt
- [ ] Wrong PIN: blocked at step 4, Join button never shown
- [ ] Unassigned wallet: blocked at step 3, PIN field never shown
- [ ] Creator auto-joined: 4 others join a 5-person circle → 5/5, startCircle works
- [ ] Invite link reloaded from DB on page refresh
- [ ] `tsc --noEmit` exits 0; `next lint` exits 0

Switch to Build mode to execute.
