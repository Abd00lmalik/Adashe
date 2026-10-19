# Adashe — Architecture

## Overview

Adashe is a rotating savings (ROSCA) dapp built on Arc Testnet.
Members form private circles, contribute USDC each period, and receive a lump-sum payout on their designated turn.
The smart contract is the source of truth for all financial state.

## Layers

```
Browser (React/Next.js)
  ↕ wagmi / viem (contract reads + writes)
Smart Contract: AdasheCircle v4
  0xcd7c871f4d0ce61ef2c90f12d2b0384299134784 (Arc Testnet)
  ↕ USDC ERC-20 calls
USDC: 0x3600000000000000000000000000000000000000 (Arc Testnet)

Browser → API Routes (Next.js App Router)
  ↕ Prisma ORM
PostgreSQL (DATABASE_URL)
```

## Contract Rules (never overridden by backend)

| Rule | Detail |
|------|--------|
| Members | 2–12, fixed at creation |
| Contribution | Fixed USDC amount, set at creation |
| Frequency | Weekly (anchor weekday) or Monthly (anchor day 1–31) |
| Grace period | Exactly 240 hours (10 days) after deadline |
| Reserve | One contributionAmount withheld from each payout |
| Debt | Tracked per period; blocks entire scheduled payout |
| Debt origin | Stays with the originating wallet; replacement inherits nothing |
| Creator powers | Approve/remove/replace members; start circle; generate invites |
| Creator limits | Cannot withdraw escrow, erase debt, override eligibility, or cancel active circle |
| Member limits | Cannot voluntarily leave an active circle |
| Circle start | Requires all N members joined + approved; first period deadline = startTime |

## Backend (PostgreSQL / Prisma)

| Table | Purpose |
|-------|---------|
| `Invite` | Invite tokens (token, circleId, expiresAt, usedBy) |
| `PinAttempt` | Rate-limit tracking for PIN verification |
| `CirclePin` | bcrypt hash of the circle PIN (server-side only) |
| `Notification` | In-app alerts per wallet (read/unread) |

The backend handles invitations, PIN verification, and notifications.
It **cannot override or censor contract state**.
All financial data (contributions, payouts, debt, reserves) is read directly from the contract.

## PIN Architecture

- The circle PIN is purely an app-level access control — it is not wallet authorization.
- PIN is stored **only** as a bcrypt hash (`bcrypt.hash(pin, 12)`) in `CirclePin.pinHash`.
- The onchain `pinHash` field in the contract is `keccak256(pin)` — a different hash, used for future
  onchain access-gating features. It is derived server-side when `createCircle` is called.
- PIN values are **never logged, returned in API responses, or stored in plaintext**.
- Brute-force mitigation: 5 attempts per 15-minute window per invite per IP.

## USDC on Arc — Critical Notes

- USDC on Arc is also the native gas asset. **One pool of funds, two views.**
- ERC-20 view: 6 decimals. This is the **only view used** for balances, transfers, approvals, and display.
- Native view: 18 decimals. Never displayed or summed with the ERC-20 view — that would double-count.
- All USDC amounts in the UI use `formatUsdc(raw: bigint)` from `src/lib/usdc.ts`.
- Never call `decimals()` on the native sentinel address — it is not an ERC-20 contract.

## Known Limitations

### `repayDebt()` — USDC blocklist edge case

`repayDebt(circleId, periodIndex)` issues a direct push transfer of the debt amount to the creditor
(the original period recipient). If that recipient address has been blocklisted by Circle on Arc,
the `transfer()` call reverts and the debtor cannot clear their debt through the normal path.

This is an inherent risk of push-based debt settlement. There is no workaround in the current contract.
If this situation occurs, the debt remains onchain indefinitely unless the contract is upgraded.
Document this risk to members before they join a circle.

## Environment Variables

See `env.example` for the full list. Required before the app is functional:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect Cloud project ID |
| `SESSION_SECRET` | Yes | 32+ char secret for iron-session cookies |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | No | Defaults to v4 contract address |
| `NEXT_PUBLIC_USDC_ADDRESS` | No | Defaults to Arc USDC address |
| `NEXT_PUBLIC_APP_URL` | No | Canonical app URL for invite links |
| `NEXT_PUBLIC_ARC_TESTNET_RPC_URL` | No | Defaults to https://rpc.testnet.arc.io |

## Security Notes

1. Never commit `.env` or `.env.local`. Both are in `.gitignore`.
2. Session secret must be at least 32 characters in production.
3. `SESSION_SECRET` is regenerated on each sandbox restart — in production, set a stable value.
4. All wallet addresses from users are lowercased before storage and comparison.
5. All contract reads are direct RPC calls — no intermediate trust layer.
6. The `CreatorPanel` is only rendered on the frontend when `isCreator === true` (address match).
   Creator-only contract functions (`approveMember`, `removeMember`, etc.) also enforce access control
   in the smart contract — frontend gating is defence-in-depth only.
