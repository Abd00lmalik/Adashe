# Implementation Plan: Adashe Onchain — Full App

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
