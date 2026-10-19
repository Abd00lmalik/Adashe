Before writing the plan I need to fully read the repo — contract, ABI, spec, deployment metadata, and existing file layout. Good. I have a thorough understanding of the full contract. Now reading the relevant skills before writing the plan. I have everything I need. Now writing the plan. Here is the full plan.

---

## Implementation Plan: Adashe Onchain — Full App

### Summary

A private, invitation-based rotating savings app for groups of 2–12 people using USDC on Arc Testnet. The contract (v4 at `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784`) is authoritative for all money; the Next.js backend handles invites, PIN hashing, sessions, and in-app notifications only.

---

### Architecture

**Blockchain:** Arc Testnet (Chain ID 5042002). USDC at `0x3600000000000000000000000000000000000000`, 6 decimals ERC-20. v4 contract at `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784`.

**Contract (read-only, never modified):** AdasheCircle v4. All financial state read via wagmi `useReadContract` / `useReadContracts`. Writes via `useWriteContract` with full tx lifecycle (signature → confirming → confirmed/failed). ABI sourced from `contracts/contract-metadata/AdasheCircle.json`.

**Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui. Design tokens: 60% warm ivory `#F5F0E6`, 30% forest green `#244B3C`, 10% terracotta `#C77D55`. Fonts: Space Grotesk (display), DM Sans (body). Photo-rich landing from Unsplash stable URLs. Mobile-first, accessible.

**Wallet:** wagmi + ConnectKit. Arc Testnet chain detection with switch prompt. Injected wallets + WalletConnect.

**Backend:** Next.js API Routes (Vercel-compatible). PostgreSQL + Prisma. Handles: invite token generation/expiry/revocation, PIN storage (bcrypt hash, rate-limited), session cookies (iron-session or next-auth), in-app notification records, circle membership indexing for fast dashboard loads. Never overrides contract facts.

---

### Capability Matrix (ABI → UI)

| Feature | Source | Notes |
|---|---|---|
| Create circle | `createCircle()` write | Frontend collects name, amount, member count, frequency, payout order addresses, PIN; derives `pinHash` server-side |
| Join circle | `joinCircle()` write | Requires invite token + PIN verified server-side first; wallet must be in payout order |
| Approve member | `approveMember()` write | Creator only; triggers auto-activation when last member approved |
| Remove pending member | `removePendingMember()` write | Creator only, PENDING circle |
| Reassign slot | `reassignPendingSlot()` write | Creator only, PENDING circle |
| Contribute | `contribute()` write | Requires prior USDC `approve()` tx |
| Finalize period | `finalizePeriod()` write | Anyone can call after all final deadlines pass |
| Claim payout | `claimPayout()` write | Recipient, zero debt required |
| Request extension | `requestExtension()` write | Contributor only, current period |
| Approve extension | `approveExtension()` write | Recipient only, current period |
| Repay creditor debt | `repayDebt(circleId, periodIndex)` write | Requires USDC approve first |
| Repay reserve debt | `repayReserveDebt(circleId, periodIndex)` write | Requires USDC approve first |
| Settle withheld payout | `settleOwnDebtFromWithheldPayout()` write | Circle COMPLETED only |
| Claim reserve refund | `claimReserveRefund()` write | Circle COMPLETED only |
| Approve replacement | `approveReplacement()` write | Creator only, outgoing must have zero debt |
| Execute replacement | `executeReplacement()` write | Creator only, after final deadline |
| All reads | `circles`, `memberRecords`, `getPeriod`, `getContribution`, `getPayoutOrder`, `getDebtByPeriod`, `getReserveDebtByPeriod`, `isInPayoutOrder`, `pendingReplacement` | wagmi `useReadContract` |

---

### Files to Create / Modify

**Root / Config**
1. `package.json` — add Next.js, shadcn/ui, wagmi, ConnectKit, viem, tanstack/react-query, prisma, @prisma/client, iron-session, bcryptjs, zod
2. `next.config.ts` — standard App Router config, env variable validation
3. `tailwind.config.ts` — design tokens, custom colors, Space Grotesk + DM Sans fonts
4. `.env.example` — all required vars with descriptions, no secrets
5. `prisma/schema.prisma` — Invite, PinAttempt, Notification, UserSession models
6. `prisma/migrations/` — initial migration

**Lib / Config**
7. `src/lib/wagmi.ts` — wagmi config, Arc Testnet chain definition, ConnectKit setup
8. `src/lib/contract.ts` — ABI import from `contracts/contract-metadata/AdasheCircle.json`, typed contract config, address constant
9. `src/lib/usdc.ts` — USDC address, decimals, `formatUsdc`, `parseUsdc` helpers
10. `src/lib/db.ts` — Prisma client singleton
11. `src/lib/session.ts` — iron-session config, session type
12. `src/lib/pin.ts` — server-side PIN hashing (bcrypt), rate-limit check helper
13. `src/lib/invite.ts` — invite token generation, expiry, revocation logic
14. `src/lib/notifications.ts` — create/fetch in-app notification records

**Providers / Layout**
15. `src/app/layout.tsx` — root layout: fonts, providers, Toaster
16. `src/providers/Web3Provider.tsx` — WagmiProvider + QueryClientProvider + ConnectKitProvider
17. `src/providers/NotificationProvider.tsx` — in-app alert context

**Landing Page**
18. `src/app/page.tsx` — landing: hero with Unsplash photo, headline, how-it-works, illustrative circle example, benefits, CTAs, footer
19. `src/components/landing/Hero.tsx` — layered photo composition, headline, CTA buttons
20. `src/components/landing/HowItWorks.tsx` — 3-step explainer with icons
21. `src/components/landing/SampleCircle.tsx` — illustrative example labelled as such, no fake data

**Auth / Wallet**
22. `src/components/layout/Navbar.tsx` — logo, ConnectKitButton, notifications bell, nav links
23. `src/app/api/auth/session/route.ts` — GET/POST session (wallet-based, no password)

**Dashboard**
24. `src/app/dashboard/page.tsx` — personalized circle list for connected wallet; empty state with create CTA
25. `src/components/dashboard/CircleCard.tsx` — circle status, next deadline, role badge, quick actions
26. `src/components/dashboard/NotificationsList.tsx` — in-app alerts (deadline approaching, debt, payout available, approvals needed)

**Create Circle**
27. `src/app/circles/new/page.tsx` — multi-step form: name → amount+frequency → member count+payout order addresses → PIN → review → submit
28. `src/components/create/StepCircleDetails.tsx`
29. `src/components/create/StepPayoutOrder.tsx` — address inputs with ENS display
30. `src/components/create/StepSetPin.tsx` — PIN entry, hashed before leaving browser, never sent plain
31. `src/components/create/ReviewAndCreate.tsx` — summary before `createCircle()` tx

**Circle Detail**
32. `src/app/circles/[circleId]/page.tsx` — main circle page, tab layout
33. `src/app/circles/[circleId]/layout.tsx` — shared data fetch shell
34. `src/components/circle/CircleHeader.tsx` — name, status badge, chain link
35. `src/components/circle/MembersList.tsx` — member rows: address, role, reserve, debt, status
36. `src/components/circle/PeriodTimeline.tsx` — all periods with recipient, deadline, contributor statuses
37. `src/components/circle/CurrentPeriod.tsx` — active period: deadline countdown, contribution status, pending actions
38. `src/components/circle/PayoutPanel.tsx` — eligible payout amount, claim button, withheld state explanation
39. `src/components/circle/DebtPanel.tsx` — debt breakdown by period, repay buttons
40. `src/components/circle/ReservePanel.tsx` — reserve balance, refund button if completed
41. `src/components/circle/ExtensionPanel.tsx` — request/approve extension UI
42. `src/components/circle/ReplacementPanel.tsx` — creator: approve replacement, execute replacement

**Invite / Join**
43. `src/app/api/circles/[circleId]/invite/route.ts` — POST: create invite token; GET: validate token (rate-limited)
44. `src/app/api/circles/[circleId]/invite/[token]/revoke/route.ts` — DELETE: revoke token
45. `src/app/join/[token]/page.tsx` — invite landing: shows circle name (no sensitive details), PIN entry, wallet connect, join CTA
46. `src/app/api/join/verify/route.ts` — POST: verify invite token + PIN, return ephemeral join credential; rate-limited, no plaintext stored
47. `src/components/join/JoinFlow.tsx` — multi-step: connect wallet → verify PIN → `joinCircle()` tx → await creator approval

**Transaction UI**
48. `src/components/tx/TxButton.tsx` — reusable: idle → awaiting signature → confirming → success/error; links tx hash to explorer
49. `src/components/tx/UsdcApproveAndAction.tsx` — checks allowance, approves if needed, then calls action; two-step tx flow
50. `src/components/tx/ContributeFlow.tsx` — contribution: approve USDC → contribute → confirmation
51. `src/components/tx/RepayDebtFlow.tsx` — debt repayment: approve USDC → repayDebt or repayReserveDebt

**Shared UI**
52. `src/components/ui/` — shadcn/ui primitives (button, card, dialog, tabs, badge, input, select, skeleton, etc.)
53. `src/components/ui/AddressDisplay.tsx` — truncated address + copy + explorer link
54. `src/components/ui/UsdcAmount.tsx` — formatted 6-decimal display with USDC label
55. `src/components/ui/CountdownTimer.tsx` — live countdown to deadline
56. `src/components/ui/ChainGuard.tsx` — wraps any action; shows "Switch to Arc Testnet" if wrong chain
57. `src/components/ui/WalletGuard.tsx` — prompts connect if no wallet
58. `src/components/ui/StatusBadge.tsx` — circle/contribution/debt status pill

**API Routes (backend)**
59. `src/app/api/circles/[circleId]/notifications/route.ts` — GET notifications for wallet
60. `src/app/api/circles/[circleId]/notifications/[id]/read/route.ts` — PATCH mark read
61. `src/app/api/notifications/route.ts` — GET all unread for connected wallet across circles

**Docs**
62. `docs/architecture.md` — stack, env vars, migrations, contract limits, known limitations (USDC blocklist push risk)
63. `README.md` — local setup, env vars, migration steps, Arc/wallet config, Vercel deployment instructions

---

### Build Sequence

1. **Project scaffold** — add Next.js to the existing repo (currently Foundry-only), configure Tailwind + design tokens, install all dependencies, set up `tsconfig.json`, add `.env.example`
2. **Prisma schema + migration** — Invite, PinAttempt, Notification models; run `prisma generate`
3. **Core lib layer** — `wagmi.ts` (Arc Testnet chain), `contract.ts` (ABI + address), `usdc.ts`, `db.ts`, `session.ts`, `pin.ts`, `invite.ts`
4. **Root layout + providers** — fonts, Web3Provider, Toaster, NotificationProvider
5. **Shared UI primitives** — shadcn/ui install + required components; AddressDisplay, UsdcAmount, CountdownTimer, ChainGuard, WalletGuard, StatusBadge, TxButton
6. **Landing page** — Hero, HowItWorks, SampleCircle (labelled illustrative), footer; Unsplash photos with alt text
7. **Navbar + dashboard shell** — Navbar with ConnectKitButton + notifications bell; dashboard page with CircleCard, empty state
8. **Create circle flow** — multi-step form + `createCircle()` tx + invite generation
9. **Invite + join flow** — invite API routes (generate, validate, revoke, rate-limit); join page with PIN verification + `joinCircle()` tx
10. **Circle detail page** — CircleHeader, MembersList, PeriodTimeline, CurrentPeriod with contribute flow
11. **Creator actions** — approveMember, removePendingMember, reassignPendingSlot; approveReplacement + executeReplacement panels
12. **Payout + debt + reserve panels** — claimPayout, repayDebt, repayReserveDebt, settleOwnDebtFromWithheldPayout, claimReserveRefund; UsdcApproveAndAction wrapper
13. **Extension flow** — requestExtension + approveExtension UI
14. **In-app notifications** — backend routes + NotificationsList component; polling or triggered on page load
15. **finalizePeriod UI** — available to anyone once all final deadlines have passed; shown in CurrentPeriod
16. **Tests** — frontend flow tests (Playwright or Vitest + React Testing Library); backend authorization + PIN + rate-limit tests
17. **Docs + .env.example** — architecture.md, README with Vercel steps

---

### Done When

- [ ] Landing page loads without wallet, explains rotating savings accurately, no fake data
- [ ] Connecting a wallet on wrong chain shows Arc Testnet switch prompt
- [ ] Creator can create a circle (form validates, `createCircle()` tx confirmed, circle appears on dashboard)
- [ ] Invite link generated; PIN entry rate-limited; `joinCircle()` tx succeeds for an address in payout order
- [ ] Creator can approve members; circle auto-activates when all approved
- [ ] Contributor can approve USDC and call `contribute()` with full tx lifecycle shown
- [ ] `finalizePeriod()` available to anyone after all deadlines; calls succeed
- [ ] Recipient can claim payout; payout withheld state displayed when debt > 0
- [ ] `repayDebt` and `repayReserveDebt` flows work end-to-end with USDC approve step
- [ ] `settleOwnDebtFromWithheldPayout` and `claimReserveRefund` accessible in completed circles
- [ ] Extension request/approve flow works
- [ ] Replacement approval + execution flows work
- [ ] All contract reads show verified onchain data; stale data labelled as such
- [ ] No plaintext PIN stored anywhere; PIN never in logs or API responses
- [ ] All 44 Foundry tests still pass
- [ ] Frontend and backend tests pass
- [ ] `.env.example` documents every required var
- [ ] README contains full local setup + Vercel deployment instructions
- [ ] Known limitation (USDC blocklist push risk in `repayDebt`) documented in `docs/architecture.md`

---

## Ready to build?

Switch to Build mode (or approve this plan) and the implementation will begin. The existing Solidity files, tests, and deployment records will not be touched.

A note on scope: this is a substantial app — roughly 60+ files across frontend, backend, and infra. The build agent will implement in the sequence above, running type-checks and tests at the end of each major stage. If you want to scope the first build to a subset (e.g., landing + dashboard + contribution flow only, deferring debt/settlement/replacement), say so and I will adjust the sequence. Plan saved to `arc-studio-plans/PLAN.md`.

A few things worth knowing before you approve:

**Scope note.** This is a large app — 63 files across frontend, backend, API routes, and docs. The build agent implements in sequence, running type-checks after each major stage. If you want to ship a leaner first version (e.g., landing + dashboard + contribute flow, then add debt/settlement/replacement in a second pass), say so and I will split the plan accordingly.

**One design constraint to confirm.** The contract's `createCircle()` requires the full `payoutOrder` (all member addresses) upfront, before anyone has joined. This means the circle creator must know — and enter — every participant's wallet address at creation time. The invite/join flow is then: creator creates the circle with those addresses pre-loaded → sends invite links → members call `joinCircle()` → creator approves each. This is exactly how the contract works and the UI will reflect it. There is no "open slot" join model.

**Known limitation documented in the plan.** `repayDebt()` does a direct push transfer to the creditor when their payout was already released. If that address is ever USDC-blocklisted on Arc, the debtor's repayment reverts and their debt cannot be cleared. This is a pre-existing contract limitation, documented in `docs/architecture.md`, not a frontend issue.

Switch to Build mode to start.
