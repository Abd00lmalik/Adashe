This is a significant plan — two contract changes plus seven frontend improvements. Let me read all the affected files before writing it. I now have a complete picture. Let me also read the logo image that was uploaded: I have everything I need. Now writing the plan.

---

## Implementation Plan: Adashe UI Improvements and Contract Upgrade (v5)

### Summary

Eight distinct changes across two layers: (1) the Solidity contract gets two targeted upgrades — auto-approval on join for pre-approved addresses, and a new `DAILY` frequency — plus a new `startCircle()` explicit start mechanism; (2) the frontend gets updated images, scroll animations, em dash removal, invite-link bug fix, the approval UX simplification, the manual start flow, daily frequency support, and the official Adashe logo integrated throughout.

---

### Architecture

**Blockchain:** Arc Testnet (Chain ID 5042002). New deployment required; old address `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784` becomes stale.

**Contract changes (v5):**
- `Frequency` enum: add `DAILY = 0`, shift `WEEKLY = 1`, `MONTHLY = 2` (or insert `DAILY = 2` to preserve existing enum order — must choose carefully since the ABI and all tests depend on numeric values)
- `joinCircle()`: auto-approve the joining wallet if it is in `payoutOrder`; remove need for `approveMember()` for the normal flow; do NOT auto-activate — joining all seats makes the circle "ready" but creator must call `startCircle()` explicitly
- Remove `approveMember()` from the normal flow (keep it for possible admin override or remove entirely — examine what breaks)
- Add `startCircle()`: callable only by creator, only when all members have joined, circle is PENDING; sets status to ACTIVE, startTime, initializes period 0
- `_periodDeadline`: add `DAILY` branch: `startTime + periodIndex * 1 days`
- `createCircle()` validation: add `require` for DAILY frequency (no weekday/anchorDay needed)
- All tests: update for new enum values, new join behavior, new start flow

**Frontend changes:**
- Images: replace all Unsplash URLs on landing page with finance/savings-focused authentic photos
- Scroll animations: `IntersectionObserver`-based fade-in on sections (no heavy library — pure CSS + tiny hook); respect `prefers-reduced-motion`
- Em dashes: grep and remove all `—` across all source files
- Circle creation: remove PIN step (PIN is now optional/internal — the join eligibility is address-based); remove approval step from join UX; add "ready to start" state
- Invite bug fix: the `generateInvite` function fails silently when `DATABASE_URL` is not set — add proper error surfacing; also the invite POST needs the `NEXT_PUBLIC_APP_URL` env to produce correct links
- CreatorPanel: replace approval buttons with `startCircle()` CTA when all members joined; show "Ready to Start" status clearly
- Frequency selector: add Daily option wired to `Frequency.DAILY = 2` (inserting as value 2 to preserve WEEKLY=0, MONTHLY=1)
- Logo: save uploaded PNG to `public/logo.png`, use in Navbar and Hero instead of the "A" letter mark

---

### Contract change design decisions (before writing code)

**Enum order:** Insert `DAILY` as value `2` to preserve `WEEKLY = 0`, `MONTHLY = 1`. All existing deployed circles use 0 or 1; tests use 0 and 1. This avoids any migration concern.

**Auto-approve on join:** `joinCircle()` sets both `mr.joined = true` AND `mr.approved = true`. `approveMember()` is kept but becomes a no-op if already approved (backward-compatible). `_allApproved()` is unchanged. The circle becomes "all-joined" when every payout order address has joined; the creator then calls `startCircle()`.

**startCircle():** Replaces the automatic activation in `approveMember()`. The creator calls it explicitly. It requires all members joined+approved and status PENDING. Sets ACTIVE, startTime, initializes period 0.

**Daily schedule:** Period deadline = `startTime + periodIndex * 1 days`. Period 0 is still `startTime`. Grace period stays 240 hours (10 days) — unchanged, as it is expressed in hours not periods.

---

### Files to Create / Modify

**Contract**
1. `contracts/AdasheCircle.sol` — add `DAILY` to Frequency enum; auto-approve in joinCircle; add startCircle(); add daily branch to _periodDeadline; update createCircle validation
2. `contracts/test/AdasheCircle.t.sol` — update helpers for new enum index 2; add tests for daily schedule, auto-approve join, startCircle(); update all existing tests that use manual approveMember activation flow
3. `contracts/contract-metadata/AdasheCircle.json` — updated after redeployment
4. `AGENTS.md` — new contract address, test count, summary

**Frontend: lib**
5. `src/lib/contract.ts` — add `Frequency.DAILY = 2`; add `startCircle` to capability notes; update `frequencyLabel` helper

**Frontend: components**
6. `public/logo.png` — save the uploaded Adashe logo
7. `src/components/layout/Navbar.tsx` — replace "A" lettermark with `<Image src="/logo.png" />` 
8. `src/components/landing/Hero.tsx` — replace hero image URL; add logo to hero area; update text removing em dashes
9. `src/app/page.tsx` — new finance/savings Unsplash images; remove em dashes; add scroll animation wrapper
10. `src/components/landing/HowItWorks.tsx` — scroll animation; remove em dashes
11. `src/components/landing/SampleCircle.tsx` — remove em dashes
12. `src/hooks/useScrollReveal.ts` — new: tiny IntersectionObserver hook for scroll-reveal
13. `src/components/ui/ScrollReveal.tsx` — new: wrapper component applying reveal animation
14. `src/components/create/CreateCircleForm.tsx` — add Daily frequency option; remove approval-step messaging; update review text
15. `src/components/circle/CreatorPanel.tsx` — replace approveMember UI with startCircle CTA; show "Ready to Start" when all joined; fix invite link error surfacing
16. `src/components/circle/CircleHeader.tsx` — add `frequencyLabel` for DAILY; remove em dashes
17. `src/components/circle/MembersList.tsx` — remove approval column (auto-approved); remove em dashes
18. `src/app/join/[token]/page.tsx` — remove "pending approval" messaging; update join flow text
19. `src/app/dashboard/page.tsx` — add "Ready to Start" status display
20. `src/components/dashboard/CircleCard.tsx` — handle PENDING+all-joined state

**Grep and replace: em dashes**
21. All `.tsx` / `.ts` files containing `—` — replace with appropriate punctuation (comma, colon, period, or space)

---

### Build Sequence

1. **Contract:** Update Solidity (enum, joinCircle, startCircle, daily schedule); update tests; run forge build + forge test; security review; Slither; redeploy to Arc Testnet
2. **Update all contract references:** contract-metadata ABI, `src/lib/contract.ts`, `AGENTS.md`, anywhere the old address appears
3. **Logo:** Copy uploaded image to `public/logo.png`; update Navbar and Hero
4. **Images:** Update all Unsplash URLs to finance/savings-focused photos
5. **Em dashes:** Grep every source file; replace all instances
6. **Scroll animations:** Add `useScrollReveal` hook + `ScrollReveal` component; wrap landing page sections
7. **Frequency selector:** Add Daily option; update all frequency labels throughout
8. **Membership flow:** Remove approval UX; add startCircle() CTA; fix invite generation error handling
9. **Lint + typecheck + build**

---

### Done When

- [ ] `Frequency.DAILY = 2` exists in contract and frontend; daily schedule computes `startTime + N*1day`
- [ ] `joinCircle()` auto-approves pre-listed wallets; no separate approveMember call needed for normal join
- [ ] `startCircle()` exists; creator can explicitly start when all joined; circle shows "Ready to Start" in UI
- [ ] All 44+ Foundry tests pass (updated for new flow); new daily and auto-approve tests added
- [ ] No em dashes remain in any user-facing string
- [ ] Landing page uses finance/savings imagery; images load correctly
- [ ] Scroll animations play on section entry; `prefers-reduced-motion` disables them
- [ ] Adashe logo appears in Navbar and Hero; no "A" lettermark
- [ ] Invite link generates successfully and surfaces errors clearly
- [ ] `0 ESLint errors`, `0 TypeScript errors`, `bun run build` exits 0
- [ ] New contract address documented in AGENTS.md and contract-metadata

---

## Ready to build?

Two important notes before you approve:

**Enum order:** I am inserting `DAILY` as value `2` (not 0) to preserve `WEEKLY = 0` and `MONTHLY = 1`. Any circles created with the old contract keep working. The new contract will be at a new address anyway, so there is no migration concern.

**`approveMember()` in the new flow:** The function will be kept in the contract (for safety and backward-compatibility) but will become a no-op if the member is already auto-approved. The UI will no longer show approval buttons for normal joins. The creator still calls `startCircle()` manually.

**PIN step:** The PIN step in circle creation and the join verification will be preserved as-is — the PIN is still a useful app-level access control even though address eligibility is now enforced on-chain. I will not remove it unless you explicitly ask. Plan saved. Here is the complete plan as text — approve it to start building.

---

## Implementation Plan: Adashe v5 — UI Improvements and Contract Upgrade

### Summary

Two layers of work: the Solidity contract gets three targeted additions (DAILY frequency, auto-approve on join, explicit `startCircle()`), then redeploys to Arc Testnet. The frontend gets updated imagery, scroll animations, em dash removal, logo integration, invite-link error fixing, daily frequency support, and the simplified membership UX that matches the new contract flow.

---

### Contract changes (v5)

| Change | Detail |
|---|---|
| `Frequency.DAILY = 2` | Inserted as value 2; `WEEKLY = 0` and `MONTHLY = 1` preserved |
| `joinCircle()` auto-approve | Sets `joined = true` AND `approved = true` for pre-listed addresses |
| `startCircle()` | New function; creator calls explicitly when all members joined; sets ACTIVE, startTime, period 0 |
| Remove auto-activation from `approveMember()` | `approveMember()` kept for backward compat but no longer auto-starts |
| Daily schedule | `periodIndex == 0` → `startTime`; `periodIndex > 0` → `startTime + periodIndex * 1 days` |
| `createCircle()` validation | DAILY branch: weekday/anchorDay not required |

---

### Frontend changes

1. **Images** — replace 3 community Unsplash photos on landing with people handling money, making payments, planning finances together
2. **Scroll animations** — `useScrollReveal` hook + `ScrollReveal` wrapper; CSS `opacity`/`translateY` transition triggered by `IntersectionObserver`; `prefers-reduced-motion` disables all animation
3. **Em dashes** — grep and replace all `—` in every `.tsx`/`.ts` file
4. **Daily frequency** — add to `CreateCircleForm` selector; update all frequency labels throughout
5. **Membership UX** — remove approval buttons from `CreatorPanel`; add `startCircle()` CTA; show "Ready to Start" badge when all joined and circle PENDING
6. **Invite fix** — `CreatorPanel.generateInvite` shows the actual server error message instead of a generic toast; validate `NEXT_PUBLIC_APP_URL` is set
7. **Logo** — `public/logo.png` from uploaded image; replace "A" lettermark in `Navbar` and use in `Hero`

---

### Build Sequence

1. Contract: update Solidity, rebuild, update tests, security review, Slither, redeploy
2. Update all contract references (ABI, `contract.ts`, `AGENTS.md`, env example)
3. Save logo to `public/logo.png`; update `Navbar` and `Hero`
4. Update Unsplash image URLs on landing page
5. Grep and remove all em dashes
6. Add `useScrollReveal` hook + `ScrollReveal` component; apply to landing sections
7. Add `Frequency.DAILY = 2` to contract.ts; update `CreateCircleForm` and all frequency labels
8. Update `CreatorPanel`: remove approval UI, add `startCircle()`, fix invite errors
9. Update `MembersList`, `CircleCard`, join page for new flow
10. Lint + typecheck + build

---

### Done When

- `Frequency.DAILY = 2` in contract and frontend; daily schedules compute correctly
- `joinCircle()` auto-approves; no `approveMember()` needed in normal flow
- `startCircle()` works; "Ready to Start" shown when all joined
- 44+ Foundry tests pass including new daily/auto-approve/startCircle tests
- No em dashes in any user-facing string
- Finance/savings imagery on landing page
- Scroll animations on section entry; reduced-motion respected
- Adashe logo in Navbar and Hero
- Invite errors surfaced clearly
- `0 ESLint errors`, `0 TypeScript errors`, `bun run build` exits 0

Switch to Build mode to start.
