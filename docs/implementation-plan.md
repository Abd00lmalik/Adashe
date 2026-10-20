Good. Since you're on Supabase (not Vercel Postgres), the env var name is likely `DATABASE_URL` — but let me read the actual Prisma schema and invite API to confirm exactly what's being used, then read all other relevant files before writing the plan. Now I have everything I need. Let me also check the contract-metadata ABI to confirm exactly which functions are missing: Confirmed. The ABI in `contract-metadata/AdasheCircle.json` is missing `getPayoutOrder`, `getPeriod`, `getContribution`, `startCircle`, and `joinCircle`. It is a stale artifact from before these functions were added. The Solidity source has all of them. The fix is to recompile (`forge build`) and extract the fresh ABI.

Now I have a complete, grounded picture. Writing the plan: Good. Now I have everything. Writing the updated plan with the three bug fixes: Here is the complete plan:

---

## Implementation Plan: Adashe v6 — Bug Fixes

### Root causes

**Bug 1 — Creator auto-inserted into Position 1**
`CreateCircleForm.tsx` initialises `payoutOrder` as `[address ?? '', ...]` (line 52) and re-fills slot 0 in `handleMemberCountChange` (line 63). The Step 2 label hardcodes `i === 0 ? ' (you)' : ''`. The contract stores exactly what the frontend submits, so this is a pure UI bug. Fix: blank all slots at init; show `(you)` dynamically on whichever slot matches the connected wallet.

**Bug 2 — Period recipients show 0x000...000**
`contracts/contract-metadata/AdasheCircle.json` (the ABI the frontend imports) is missing `getPayoutOrder`, `getPeriod`, `getContribution`, `startCircle`, and `joinCircle`. These functions exist in the Solidity source but the ABI was never regenerated after they were added. Every `useReadContracts` call for `getPayoutOrder`/`getPeriod` fails silently and falls back to zero values. Fix: `forge build` regenerates the ABI; redeploy since the currently deployed bytecode also lacks these function selectors; update all address references. Additionally, for PENDING circles periods are not initialized until `startCircle()` runs — the frontend must show a truthful "Assigned when circle starts" placeholder rather than rendering zero addresses.

**Bug 3 — "Failed to create invite" every time**
The invite API route catches all Prisma errors and throws a single generic message — the real error (Prisma connection refused, bad `DATABASE_URL`) never reaches the UI. The server does log it, but the creator sees nothing actionable. Fix: return the actual error string in development and a meaningful (non-generic) message in production. Separately: the schema reads `DATABASE_URL` — for Supabase on Vercel this must be the pooled connection string (Supabase calls it "Transaction pooler" or "Session pooler" URL). The `.env.example` will document this.

### Files to change

| # | File | Why |
|---|------|-----|
| 1 | `contracts/AdasheCircle.sol` | No logic changes; recompile only to regenerate ABI |
| 2 | `contracts/contract-metadata/AdasheCircle.json` | Replace with fresh `forge build` artifact; update address |
| 3 | `src/lib/contract.ts` | Update hardcoded fallback address |
| 4 | `AGENTS.md` | New contract address |
| 5 | `.env.example` | Document that `DATABASE_URL` = Supabase pooled connection string |
| 6 | `src/components/create/CreateCircleForm.tsx` | Remove slot-0 autofill; dynamic `(you)` label |
| 7 | `src/components/circle/PeriodTimeline.tsx` | Show "Assigned when circle starts" for PENDING circles |
| 8 | `src/components/circle/MembersList.tsx` | Guard against empty payoutOrder when ABI call fails |
| 9 | `src/components/circle/CreatorPanel.tsx` | Pass `data.error` verbatim in toast; don't swallow errors |
| 10 | `src/app/api/circles/[circleId]/invite/route.ts` | Return descriptive error in catch; dev vs prod distinction |

### Build sequence

1. `forge build` — regenerate ABI, confirm 52/52 tests pass, redeploy to Arc Testnet
2. Update `contract-metadata/AdasheCircle.json`, `contract.ts`, `AGENTS.md`, `.env`
3. Fix `CreateCircleForm.tsx` — remove autofill, fix `(you)` label
4. Fix `PeriodTimeline.tsx` — pending state guard
5. Fix `MembersList.tsx` — empty payoutOrder guard
6. Fix invite API route — descriptive errors; fix `CreatorPanel` toast message
7. `tsc --noEmit` + `next lint` — 0 errors

### Done when

- [ ] `forge build` exits 0; `forge test` 52/52 pass
- [ ] New contract deployed; address in all references; ABI has `getPayoutOrder`, `getPeriod`, `startCircle`, `joinCircle`
- [ ] Creating a circle with 5 addresses: creator's wallet does NOT auto-fill slot 0
- [ ] `(you)` appears only on the position whose address matches the connected wallet
- [ ] PENDING circle periods show "Assigned when circle starts" (not zero addresses)
- [ ] ACTIVE circle periods show correct recipients from on-chain `getPeriod` data
- [ ] Generate Invite Link either succeeds or shows a useful, specific error message
- [ ] `tsc --noEmit` exits 0; `next lint` exits 0

---

Switch to Build mode to execute this. The redeployment will happen first since everything else depends on the correct ABI being in place.
