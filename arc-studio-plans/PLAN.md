# Implementation Plan: Adashe v6 — Bug Fixes (Position Assignment, Period Recipients, Invite Link)

> Supersedes v5 plan. All three bugs are rooted in the same underlying issue: the contract-metadata ABI is stale and missing several functions. Fix sequence: recompile → regenerate ABI → redeploy → fix frontend data reads → fix CreateCircleForm autofill → fix invite error surfacing.

---

## Root Cause Summary

### Bug 1: Creator auto-inserted into Position 1
`CreateCircleForm.tsx` line 52 initialises `payoutOrder` as `[address ?? '', ...]`, pre-filling the connected wallet into slot 0. Line 63 (`handleMemberCountChange`) re-fills slot 0 any time the member count changes. The Step 2 label hardcodes `i === 0 ? ' (you)' : ''`. These are UI-only bugs — the contract stores exactly what the frontend submits. Fix: remove both autofills; show `(you)` dynamically on whichever position contains the connected wallet.

### Bug 2: All period recipients show 0x000...000
`contracts/contract-metadata/AdasheCircle.json` (the ABI imported by the frontend) is missing `getPayoutOrder`, `getPeriod`, `getContribution`, `startCircle`, and `joinCircle`. These functions exist in `contracts/AdasheCircle.sol` but were never in the compiled artifact used at deployment, meaning the deployed bytecode also lacks them. Every `useReadContracts` call for `getPayoutOrder` / `getPeriod` fails silently and falls back to zero values. Fix: recompile with `forge build`, regenerate the ABI from `out/AdasheCircle.sol/AdasheCircle.json`, redeploy to Arc Testnet, update all address references.

Additionally, for PENDING circles `_periods` is not yet initialized (initialization happens inside `startCircle()`), so `getPeriod` legitimately returns zeros until the circle is started. The frontend must detect the PENDING state and show a truthful "Assigned at circle start" placeholder instead of `0x000...000`.

### Bug 3: "Failed to create invite" on every attempt
The invite API route calls `db.invite.create(...)` via Prisma. Prisma reads `DATABASE_URL` from `schema.prisma`. The error is caught and rethrown as the generic message `"Failed to create invite"` — the real Prisma error (e.g., connection refused, unknown env var) is logged to the server console only and never shown in the UI. Fix: (a) ensure `DATABASE_URL` in Vercel points to the Supabase connection string, and (b) surface the actual error message in development and a meaningful non-generic message in production so the creator knows what to fix.

---

## Files to Change

1. `contracts/AdasheCircle.sol` — no logic changes; recompile only to regenerate ABI with all getter functions
2. `contracts/contract-metadata/AdasheCircle.json` — replace entire file with fresh artifact from `forge build` output; update `address` field to new deployment
3. `src/lib/contract.ts` — update `CONTRACT_ADDRESS` constant to new deployment address
4. `AGENTS.md` — update contract address and note v6 deployment
5. `.env` / `.env.example` — document that `DATABASE_URL` must be the Supabase connection string (pooled mode for Vercel, direct URL for migrations)
6. `src/components/create/CreateCircleForm.tsx` — remove autofill of slot 0 with connected wallet; change `(you)` label from hardcoded slot-0 to dynamic match against connected address
7. `src/components/circle/PeriodTimeline.tsx` — handle PENDING circles: when `pd` is null (call failed or circle not started), show "Assigned at circle start" instead of `0x000...000`; keep existing display for ACTIVE/COMPLETED circles
8. `src/components/circle/MembersList.tsx` — handle empty payoutOrder gracefully when `getPayoutOrder` returns failure; add a loading/pending state so the list never renders zero addresses
9. `src/components/circle/CreatorPanel.tsx` — improve invite error: pass the server's actual `data.error` string to the toast; add a hint about `DATABASE_URL` only if the error string mentions a connection problem
10. `src/app/api/circles/[circleId]/invite/route.ts` — in the catch block, log the full error and return a more specific message in development (`err.message`) vs production ("Invite creation failed. Check server logs.")

---

## Build Sequence

1. **Recompile and redeploy contract** — `forge build` (no Solidity changes needed; this regenerates the ABI). Run `forge test` to confirm 52/52 pass. Deploy to Arc Testnet. Extract fresh ABI from `out/AdasheCircle.sol/AdasheCircle.json` and write it to `contracts/contract-metadata/AdasheCircle.json` with the new address.

2. **Update contract address references** — `src/lib/contract.ts` hardcoded fallback address; `AGENTS.md`; `.env` `NEXT_PUBLIC_CONTRACT_ADDRESS`.

3. **Fix Bug 1: CreateCircleForm autofill** — In `defaultForm`, `payoutOrder` must be `Array(5).fill('')`. In `handleMemberCountChange`, remove the `if (newOrder[0] === '' && address)` backfill. In Step 2 JSX, change the label from `i === 0 ? ' (you)' : ''` to a dynamic check: `sameAddress(form.payoutOrder[i], address ?? '') ? ' (you)' : ''`. Add a hint below the address inputs: "Your connected wallet: {address}" so the creator can see which address to copy into the correct slot.

4. **Fix Bug 2: PeriodTimeline pending state** — When circle status is PENDING (status === 0) and `pd` is null, render "Assigned when circle starts" in place of the recipient `AddressDisplay`. Do not render `AddressDisplay` with an empty string. Check `isPending` from `circleRaw[9]` (the `status` field).

5. **Fix Bug 2: MembersList empty payoutOrder** — When `payoutOrder` is empty (ABI call failed), show a skeleton + "Loading members..." rather than an empty list. After the fix is deployed and the ABI is correct, this will resolve naturally; the guard prevents rendering garbage in the meantime.

6. **Fix Bug 3: Invite error surfacing** — In the API route catch block, differentiate dev vs prod. In `CreatorPanel.generateInvite`, display `data.error` verbatim in the toast (it is already done in the current code at line 75, but the server is throwing the generic message before it reaches that branch). The server-side fix is what matters: return a descriptive error string.

7. **Run lint + typecheck** — `tsc --noEmit` and `next lint`. Fix any errors.

8. **Update Forge tests** — Confirm 52/52 still pass after recompile (no logic changed).

---

## Done When

- [ ] `forge build` exits 0; `forge test` 52/52 pass
- [ ] New contract deployed to Arc Testnet; address updated everywhere
- [ ] `getPayoutOrder`, `getPeriod`, `getContribution`, `startCircle`, `joinCircle` all present in `contract-metadata/AdasheCircle.json`
- [ ] Creating a circle with 5 distinct addresses does not autofill the creator into slot 0
- [ ] "You" label appears only on the position whose address matches the connected wallet
- [ ] PENDING circles show "Assigned when circle starts" per period (not 0x000...000)
- [ ] ACTIVE circles show correct recipient addresses from `getPeriod` on-chain data
- [ ] Generate Invite Link succeeds and shows the actual error (not a generic message) on failure
- [ ] `tsc --noEmit` exits 0; `next lint` exits 0

---

# Implementation Plan: Adashe v5 — UI Improvements and Contract Upgrade

> Supersedes earlier full-app plan. Contract v4 is deployed; this plan upgrades it to v5 and applies the frontend improvements listed below.

---

## Changes in this plan

### Contract (v5)
- Add `Frequency.DAILY = 2`; keep `WEEKLY = 0`, `MONTHLY = 1`
- `joinCircle()` auto-approves the caller (pre-listed address) — no separate `approveMember()` needed for normal join
- Add `startCircle()` — creator explicitly starts once all members joined; removes auto-activation from `approveMember()`
- Add daily period deadline: `startTime + periodIndex * 1 days`
- Update `createCircle()` validation for DAILY (no weekday/anchorDay required)
- Update all tests; add daily, auto-approve, and startCircle tests; redeploy to Arc Testnet

### Frontend
1. Images — replace landing page Unsplash photos with finance/savings/community imagery
2. Scroll animations — fade-in on section entry; respect `prefers-reduced-motion`
3. Em dashes — remove all `—` throughout the app
4. Membership flow — remove approval-step UX; add "Ready to Start" + startCircle() CTA
5. Invite fix — surface errors clearly; fix `NEXT_PUBLIC_APP_URL` fallback
6. Daily frequency — add Daily to frequency selector and all labels
7. Logo — use uploaded `public/logo.png` in Navbar and Hero
8. Circle start — manual only; creator calls startCircle() when ready

---

## Files to Change (v5 additions)

- `contracts/AdasheCircle.sol` — enum, joinCircle, startCircle, daily schedule
- `contracts/test/AdasheCircle.t.sol` — updated + new tests
- `contracts/contract-metadata/AdasheCircle.json` — post-redeploy
- `AGENTS.md` — new address, test count
- `public/logo.png` — uploaded logo asset
- `src/lib/contract.ts` — DAILY enum, startCircle label, frequency helpers
- `src/components/layout/Navbar.tsx` — logo image
- `src/components/landing/Hero.tsx` — new image, logo, no em dashes
- `src/app/page.tsx` — new images, em dashes, scroll animations
- `src/components/landing/HowItWorks.tsx` — scroll animation, em dashes
- `src/components/landing/SampleCircle.tsx` — em dashes
- `src/hooks/useScrollReveal.ts` — new IntersectionObserver hook
- `src/components/ui/ScrollReveal.tsx` — new wrapper component
- `src/components/create/CreateCircleForm.tsx` — Daily option, updated flow text
- `src/components/circle/CreatorPanel.tsx` — startCircle CTA, invite error fix, remove approval UI
- `src/components/circle/CircleHeader.tsx` — daily label, em dashes
- `src/components/circle/MembersList.tsx` — em dashes, auto-approved display
- `src/app/join/[token]/page.tsx` — remove "pending approval" text
- `src/components/dashboard/CircleCard.tsx` — "Ready to Start" state

---

## Done When (v5)

- [ ] Frequency.DAILY = 2 in contract + frontend; daily deadlines correct
- [ ] joinCircle() auto-approves; no approveMember() needed in normal flow
- [ ] startCircle() exists; creator starts manually; "Ready to Start" shown when all joined
- [ ] 44+ Foundry tests pass; new daily + auto-approve + startCircle tests added
- [ ] No em dashes in any user-facing string
- [ ] Landing page uses finance/savings imagery
- [ ] Scroll animations on section entry; reduced-motion respected
- [ ] Adashe logo in Navbar and Hero
- [ ] Invite link generates + errors surfaced clearly
- [ ] 0 ESLint errors, 0 TypeScript errors, bun run build exits 0
- [ ] New contract address in AGENTS.md and contract-metadata

---

# Implementation Plan: Adashe Onchain — Full App (original, preserved for reference)

## Summary
A private, invitation-based rotating savings app for groups of 2–12 people using USDC on Arc Testnet. The contract (v4 at `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784`) is authoritative for all money; the Next.js backend handles invites, PIN hashing, sessions, and in-app notifications only.

---

## Architecture

- **Blockchain:** Arc Testnet (Chain ID 5042002). USDC at `0x3600000000000000000000000000000000000000`, 6 decimals ERC-20. v4 contract at `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784`.
- **Contract (read-only, never modified):** AdasheCircle v4. All financial state read via wagmi `useReadContract` / `useReadContracts`. Writes via `useWriteContract` with full tx lifecycle. ABI from `contracts/contract-metadata/AdasheCircle.json`.
- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui. Design tokens: 60% warm ivory `#F5F0E6`, 30% forest green `#244B3C`, 10% terracotta `#C77D55`. Fonts: Space Grotesk (display), DM Sans (body). Photo-rich landing from Unsplash stable URLs. Mobile-first, accessible.
- **Wallet:** wagmi + ConnectKit. Arc Testnet chain detection with switch prompt. Injected wallets + WalletConnect.
- **Backend:** Next.js API Routes (Vercel-compatible). PostgreSQL + Prisma. Handles: invite token generation/expiry/revocation, PIN storage (bcrypt hash, rate-limited), session cookies (iron-session), in-app notification records, circle membership indexing. Never overrides contract facts.

---

## Capability Matrix

| Feature | Contract Method | Notes |
|---|---|---|
| Create circle | `createCircle()` | PIN hashed server-side, never plain |
| Join circle | `joinCircle()` | Invite token + PIN verified server-side first |
| Approve member | `approveMember()` | Creator only; auto-activates when all approved |
| Remove pending member | `removePendingMember()` | Creator only, PENDING |
| Reassign slot | `reassignPendingSlot()` | Creator only, PENDING |
| Contribute | `contribute()` | Requires prior USDC `approve()` tx |
| Finalize period | `finalizePeriod()` | Anyone, after all final deadlines pass |
| Claim payout | `claimPayout()` | Recipient, zero debt required |
| Request extension | `requestExtension()` | Contributor, current period |
| Approve extension | `approveExtension()` | Recipient, current period |
| Repay creditor debt | `repayDebt(circleId, periodIndex)` | USDC approve first |
| Repay reserve debt | `repayReserveDebt(circleId, periodIndex)` | USDC approve first |
| Settle withheld payout | `settleOwnDebtFromWithheldPayout()` | COMPLETED only |
| Claim reserve refund | `claimReserveRefund()` | COMPLETED only |
| Approve replacement | `approveReplacement()` | Creator only, outgoing zero debt |
| Execute replacement | `executeReplacement()` | Creator only, after final deadline |
| All reads | `circles`, `memberRecords`, `getPeriod`, `getContribution`, `getPayoutOrder`, `getDebtByPeriod`, `getReserveDebtByPeriod`, `isInPayoutOrder`, `pendingReplacement` | wagmi `useReadContract` |

---

## Files to Create / Modify

### Root / Config
1. `package.json` — add Next.js, shadcn/ui, wagmi, ConnectKit, viem, tanstack/react-query, prisma, @prisma/client, iron-session, bcryptjs, zod
2. `next.config.ts` — App Router config, env validation
3. `tailwind.config.ts` — design tokens, custom colors, Space Grotesk + DM Sans fonts
4. `.env.example` — all required vars with descriptions, no secrets
5. `prisma/schema.prisma` — Invite, PinAttempt, Notification, UserSession models
6. `prisma/migrations/` — initial migration

### Lib / Config
7. `src/lib/wagmi.ts` — wagmi config, Arc Testnet chain, ConnectKit setup
8. `src/lib/contract.ts` — ABI import, typed contract config, address constant
9. `src/lib/usdc.ts` — USDC address, decimals, `formatUsdc`, `parseUsdc`
10. `src/lib/db.ts` — Prisma client singleton
11. `src/lib/session.ts` — iron-session config and session type
12. `src/lib/pin.ts` — server-side PIN hashing (bcrypt), rate-limit helper
13. `src/lib/invite.ts` — invite token generation, expiry, revocation
14. `src/lib/notifications.ts` — create/fetch in-app notification records

### Providers / Layout
15. `src/app/layout.tsx` — root layout: fonts, providers, Toaster
16. `src/providers/Web3Provider.tsx` — WagmiProvider + QueryClientProvider + ConnectKitProvider
17. `src/providers/NotificationProvider.tsx` — in-app alert context

### Landing Page
18. `src/app/page.tsx` — landing: hero, how-it-works, illustrative sample, benefits, CTAs, footer
19. `src/components/landing/Hero.tsx` — layered Unsplash photo, headline, CTA buttons
20. `src/components/landing/HowItWorks.tsx` — 3-step explainer
21. `src/components/landing/SampleCircle.tsx` — illustrative example, labelled as such

### Auth / Wallet
22. `src/components/layout/Navbar.tsx` — logo, ConnectKitButton, notifications bell
23. `src/app/api/auth/session/route.ts` — wallet-based session GET/POST

### Dashboard
24. `src/app/dashboard/page.tsx` — circle list for connected wallet; empty state
25. `src/components/dashboard/CircleCard.tsx` — status, next deadline, role badge
26. `src/components/dashboard/NotificationsList.tsx` — in-app alerts

### Create Circle
27. `src/app/circles/new/page.tsx` — multi-step form + `createCircle()` tx
28. `src/components/create/StepCircleDetails.tsx`
29. `src/components/create/StepPayoutOrder.tsx`
30. `src/components/create/StepSetPin.tsx` — PIN hashed before leaving browser
31. `src/components/create/ReviewAndCreate.tsx`

### Circle Detail
32. `src/app/circles/[circleId]/page.tsx`
33. `src/app/circles/[circleId]/layout.tsx`
34. `src/components/circle/CircleHeader.tsx`
35. `src/components/circle/MembersList.tsx`
36. `src/components/circle/PeriodTimeline.tsx`
37. `src/components/circle/CurrentPeriod.tsx`
38. `src/components/circle/PayoutPanel.tsx`
39. `src/components/circle/DebtPanel.tsx`
40. `src/components/circle/ReservePanel.tsx`
41. `src/components/circle/ExtensionPanel.tsx`
42. `src/components/circle/ReplacementPanel.tsx`

### Invite / Join
43. `src/app/api/circles/[circleId]/invite/route.ts` — POST create, GET validate (rate-limited)
44. `src/app/api/circles/[circleId]/invite/[token]/revoke/route.ts` — DELETE revoke
45. `src/app/join/[token]/page.tsx` — invite landing + PIN entry + `joinCircle()` tx
46. `src/app/api/join/verify/route.ts` — POST verify invite + PIN, rate-limited
47. `src/components/join/JoinFlow.tsx`

### Transaction UI
48. `src/components/tx/TxButton.tsx` — idle → signing → confirming → success/error + explorer link
49. `src/components/tx/UsdcApproveAndAction.tsx` — check allowance → approve → action (two-step)
50. `src/components/tx/ContributeFlow.tsx`
51. `src/components/tx/RepayDebtFlow.tsx`

### Shared UI
52. `src/components/ui/` — shadcn/ui primitives
53. `src/components/ui/AddressDisplay.tsx`
54. `src/components/ui/UsdcAmount.tsx`
55. `src/components/ui/CountdownTimer.tsx`
56. `src/components/ui/ChainGuard.tsx` — "Switch to Arc Testnet" if wrong chain
57. `src/components/ui/WalletGuard.tsx`
58. `src/components/ui/StatusBadge.tsx`

### API Routes
59. `src/app/api/circles/[circleId]/notifications/route.ts`
60. `src/app/api/circles/[circleId]/notifications/[id]/read/route.ts`
61. `src/app/api/notifications/route.ts`

### Docs
62. `docs/architecture.md` — stack, env vars, migrations, contract limits, known limitation (USDC blocklist push risk in `repayDebt`)
63. `README.md` — local setup, env vars, migrations, Arc/wallet config, Vercel deployment steps

---

## Build Sequence

1. Project scaffold — Next.js into existing repo, Tailwind design tokens, deps, `.env.example`
2. Prisma schema + migration — Invite, PinAttempt, Notification models
3. Core lib layer — wagmi.ts, contract.ts, usdc.ts, db.ts, session.ts, pin.ts, invite.ts
4. Root layout + providers — fonts, Web3Provider, Toaster, NotificationProvider
5. Shared UI primitives — shadcn/ui + AddressDisplay, UsdcAmount, CountdownTimer, ChainGuard, WalletGuard, StatusBadge, TxButton
6. Landing page — Hero (Unsplash), HowItWorks, SampleCircle (labelled), footer
7. Navbar + dashboard shell — ConnectKitButton, notifications bell, CircleCard, empty state
8. Create circle flow — multi-step form + createCircle() tx + invite generation
9. Invite + join flow — API routes (generate, validate, revoke, rate-limit) + join page
10. Circle detail page — CircleHeader, MembersList, PeriodTimeline, CurrentPeriod + contribute flow
11. Creator actions — approveMember, removePendingMember, reassignPendingSlot, approveReplacement, executeReplacement
12. Payout + debt + reserve panels — claimPayout, repayDebt, repayReserveDebt, settleOwnDebtFromWithheldPayout, claimReserveRefund
13. Extension flow — requestExtension + approveExtension
14. In-app notifications — backend routes + NotificationsList
15. finalizePeriod UI — anyone can call after all deadlines pass
16. Tests — frontend flow tests, backend PIN/auth/rate-limit tests
17. Docs + README — architecture.md, Vercel deployment instructions

---

## Done When

- [ ] Landing loads without wallet; explains rotating savings; no fake data
- [ ] Wrong chain shows Arc Testnet switch prompt
- [ ] Creator can create a circle; circle appears on dashboard
- [ ] Invite link generated; PIN rate-limited; joinCircle() tx succeeds
- [ ] Creator can approve members; circle auto-activates
- [ ] Contributor can approve USDC and contribute with full tx lifecycle
- [ ] finalizePeriod() available after all deadlines
- [ ] Payout claim works; withheld state shown when debt > 0
- [ ] repayDebt and repayReserveDebt flows work end-to-end
- [ ] settleOwnDebtFromWithheldPayout and claimReserveRefund work in completed circles
- [ ] Extension request/approve flow works
- [ ] Replacement approval + execution flows work
- [ ] All contract reads show verified onchain data
- [ ] No plaintext PIN stored anywhere
- [ ] All 44 Foundry tests still pass
- [ ] Frontend and backend tests pass
- [ ] .env.example documents every required var
- [ ] README has full local setup + Vercel deployment instructions
- [ ] Known limitation (USDC blocklist push risk) documented in architecture.md

---

## User Decisions Recorded

- Backend: PostgreSQL + Prisma
- WalletConnect: Project ID supplied by user via .env
- Notifications: In-app only (dashboard alerts and status indicators)
