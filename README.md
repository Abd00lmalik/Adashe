# Adashe Onchain

A private, invitation-based rotating savings circle app using USDC on Arc.

The creator coordinates. The smart contract governs the money.

---

## What it is

Adashe is a digital implementation of the traditional rotating savings practice (known as Adashe, Susu, Tontine, Chit Fund, or Hui depending on region). A group agrees on a fixed contribution amount and takes turns receiving the pooled contributions. The entire arrangement is enforced onchain — no one (including the creator) can withdraw funds outside the rules.

- **Chain:** Arc Testnet (Chain ID 5042002)
- **Currency:** USDC (6 decimals, `0x3600000000000000000000000000000000000000`)
- **Contract:** AdasheCircle v4 at `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784`
- **Explorer:** https://explorer.testnet.arc.io/address/0xcd7c871f4d0ce61ef2c90f12d2b0384299134784

---

## Local Setup

### Prerequisites

- Node.js 18+ or Bun 1.x
- PostgreSQL database (local or hosted)
- WalletConnect Project ID (free at https://cloud.walletconnect.com)

### 1. Clone the repo

```bash
git clone https://github.com/Abd00lmalik/Adashe.git
cd Adashe
```

### 2. Install dependencies

```bash
bun install
# or: npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

| Variable | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | Yes | Your PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Run `openssl rand -hex 32` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | https://cloud.walletconnect.com |

All other variables have working defaults for Arc Testnet.

### 4. Run database migrations

```bash
bun run db:generate   # generates Prisma client
bun run db:migrate    # applies migrations to your database
```

### 5. Start the development server

```bash
bun run dev
# App available at http://localhost:5173
```

---

## Arc Testnet Wallet Setup

To test the app you need a wallet funded with Arc Testnet USDC:

1. Add Arc Testnet to MetaMask (or any EVM wallet):
   - Network name: Arc Testnet
   - RPC URL: `https://rpc.testnet.arc.io`
   - Chain ID: `5042002`
   - Currency symbol: `USDC`
   - Block explorer: `https://explorer.testnet.arc.io`

2. Get testnet USDC from https://faucet.circle.com (select Arc Testnet)

3. Connect your wallet in the app — it will prompt you to switch to Arc Testnet if you are on the wrong chain.

---

## Creating a Circle (Quick Guide)

1. Connect your wallet
2. Click **Create Circle** on the dashboard
3. Enter: circle name, contribution amount (in USDC), frequency (weekly or monthly), and member count
4. Enter all member wallet addresses in payout order (your address goes in slot 1 if you want to receive first)
5. Set a PIN (shared with members via invite link)
6. Submit the transaction — the circle is created onchain
7. Go to **Invite Members** and copy the invite link
8. Share the link + PIN with your members privately
9. Approve each member as they join
10. The circle activates automatically when all members are approved

---

## Vercel Deployment

### Prerequisites

- Vercel account (https://vercel.com)
- PostgreSQL database accessible from Vercel (Vercel Postgres, Neon, Railway, Supabase, etc.)

### Steps

1. Push the repository to GitHub (if not already there)

2. Import the project in Vercel:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Framework preset: **Next.js** (auto-detected)
   - Root directory: leave blank (repo root)

3. Add environment variables in the Vercel project dashboard:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Your PostgreSQL connection string |
   | `SESSION_SECRET` | A random 32+ character string |
   | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Your WalletConnect Project ID |
   | `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL (e.g. `https://adashe.vercel.app`) |

4. Click **Deploy**

5. After the first deployment, run the database migration:
   - Install Vercel CLI: `npm i -g vercel`
   - Pull env vars: `vercel env pull .env.production.local`
   - Run migration: `DATABASE_URL="<your-db-url>" npx prisma migrate deploy`

   Or connect Vercel Postgres and run `prisma migrate deploy` via a build step:
   Add to `package.json` scripts: `"build": "prisma migrate deploy && next build"`

6. (Optional) Add a custom domain in the Vercel project settings, then update `NEXT_PUBLIC_APP_URL`.

---

## Database Schema

Managed by Prisma. Schema at `prisma/schema.prisma`.

| Table | Purpose |
|---|---|
| `Invite` | Invite tokens with expiry, used-by tracking |
| `PinAttempt` | Rate-limit state for PIN verification (5 attempts / 15 min / IP) |
| `CirclePin` | bcrypt hash of the circle PIN — never stored plaintext |
| `Notification` | In-app alerts per wallet address |

Run `bun run db:studio` to open Prisma Studio (a web UI for the database).

---

## Tests

### Solidity (Foundry)

```bash
cd contracts  # stay at repo root, tests are in contracts/test/
forge test
```

44 tests, all passing. Coverage: contributions, defaults, reserves, debt, extensions, replacements, settlement.

### Frontend / Backend

```bash
bun run test
```

Vitest-based tests in `src/__tests__/`. Covers:
- PIN hashing and rate-limit logic
- Invite token generation and expiry
- Backend authorization rules
- Component rendering (WalletGuard, ChainGuard, UsdcAmount)

---

## Contract ABI and Capability Notes

The full ABI is at `contracts/contract-metadata/AdasheCircle.json`.

Key capabilities:

| Action | Who can call | Notes |
|---|---|---|
| `createCircle` | Anyone | Creator address set at call time |
| `joinCircle` | Any address in payout order | Requires invite + PIN verified app-side first |
| `approveMember` | Creator only | Auto-activates circle when all approved |
| `contribute` | Non-recipient members | Requires USDC `approve()` first |
| `finalizePeriod` | Anyone | Only callable after all final deadlines pass |
| `claimPayout` | Period recipient | Blocked if `debtBalance > 0` |
| `repayDebt` | Any member with debt | Per-period; routes funds to creditor |
| `repayReserveDebt` | Any member with reserve debt | Per-period; restores caller's own reserve |
| `settleOwnDebtFromWithheldPayout` | Withheld payout recipient | Circle COMPLETED only |
| `claimReserveRefund` | Any member | Circle COMPLETED only |
| `approveReplacement` | Creator only | Outgoing must have zero debt |
| `executeReplacement` | Creator only | After final deadline of current period |

### Known Limitation

`repayDebt()` issues a direct push transfer to the creditor address. If that address is USDC-blocklisted by Circle, the transfer reverts and the debt cannot be cleared through the normal path. See `docs/architecture.md` for full details.

---

## Architecture

See `docs/architecture.md` for:
- Full layer diagram
- Contract rules summary
- PIN security model
- USDC/Arc decimal handling
- Security notes

---

## Contracts

| Version | Address | Status |
|---|---|---|
| v4 (current) | `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784` | Active — Arc Testnet |
| v3 | `0x20c9fc1e5062df4702798a57b2535bf429b0c912` | Superseded |
| v2 | `0xa61aeab00c4b761f79bb8a22b6e167d28e37cfbd` | Superseded |
| v1 | `0xf230a4353bf45b2d43f79d1803868ad8c8e49018` | Superseded |

---

## Disclaimer

This is testnet software. Transactions on Arc Testnet use testnet USDC with no real monetary value.
Rotating savings groups involve financial commitments among members — the contract enforces the agreed rules, but it cannot force repayment from wallets that do not have funds.
This application does not guarantee returns, provide financial advice, or operate as a bank.
