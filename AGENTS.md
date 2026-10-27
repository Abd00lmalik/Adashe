# Adashe Onchain — Agent Memory

## Deployed Contracts

| Contract | Chain | Address | Tx Hash | Explorer |
|---|---|---|---|---|
| AdasheCircle v12 (current) | Arc Testnet | `0x507162ce32cc169185df376ebf9a5aaf4f9fb03d` | `0x82930875b1c466ce560d62dffd87cb575d0d7f629d171013f7b1586764fb82b9` | [View](https://explorer.testnet.arc.io/address/0x507162ce32cc169185df376ebf9a5aaf4f9fb03d) |
| AdasheCircle v10 (stale) | Arc Testnet | `0x2891663ecf025c98f2a3128106f48691f86c5910` | `0x9624a7cbaa8a2fd2ff0b6941efa5bbcb440c0cc8a0fb01eb2f46610d2a11b447` | [View](https://explorer.testnet.arc.io/address/0x2891663ecf025c98f2a3128106f48691f86c5910) |
| AdasheCircle v7 (superseded) | Arc Testnet | `0x369bb6da1ef5d1d78e989336e57b1e1d53a482ef` | `0x58511777f4d303f5418ea3dc7fb5d8058a71cf57de63e69678365051106606ad` | [View](https://explorer.testnet.arc.io/address/0x369bb6da1ef5d1d78e989336e57b1e1d53a482ef) |
| AdasheCircle v6 (superseded) | Arc Testnet | `0xd98f33d01cf491526d2acdb5d34ddbae49248d54` | `0x3a96b0c9132a76a137952e39c78298079836eb17082f0b7b446fc21c7579c41a` | [View](https://explorer.testnet.arc.io/address/0xd98f33d01cf491526d2acdb5d34ddbae49248d54) |
| AdasheCircle v4 (superseded) | Arc Testnet | `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784` | `0x2b0ff88ca4220b9babeafd82e270804334d0e1a54f52b89a049e43ec3ac425df` | [View](https://explorer.testnet.arc.io/address/0xcd7c871f4d0ce61ef2c90f12d2b0384299134784) |
| AdasheCircle v3 (superseded) | Arc Testnet | `0x20c9fc1e5062df4702798a57b2535bf429b0c912` | `0x8dd1113249fe079822c2af9df9f85335e185b8f53762c99669a874da774c2c84` | [View](https://explorer.testnet.arc.io/address/0x20c9fc1e5062df4702798a57b2535bf429b0c912) |
| AdasheCircle v2 (superseded) | Arc Testnet | `0xa61aeab00c4b761f79bb8a22b6e167d28e37cfbd` | `0x546ea5b254c27c2f7a82c7963426a525dc63daead6d5386bcb9b24ad6b504d98` | [View](https://explorer.testnet.arc.io/address/0xa61aeab00c4b761f79bb8a22b6e167d28e37cfbd) |
| AdasheCircle v1 (superseded) | Arc Testnet | `0xf230a4353bf45b2d43f79d1803868ad8c8e49018` | `0xb4b6bbbaa6f01c191b44021028a23ec18933751899e842b686fe5f70cbf0d7e5` | [View](https://explorer.testnet.arc.io/address/0xf230a4353bf45b2d43f79d1803868ad8c8e49018) |

## Network Configuration

- **Chain:** Arc Testnet (Chain ID: 5042002)
- **USDC:** `0x3600000000000000000000000000000000000000` (6 decimals, ERC-20 view)
- **RPC:** `https://rpc.testnet.arc.io`
- **Explorer:** `https://explorer.testnet.arc.io`
- **v7 Deployed:** 2026-10-20T08:10:05Z (contract ID: 01a1585c-388c-70a8-9423-11667fbc5090) — new address `0x369bb6da1ef5d1d78e989336e57b1e1d53a482ef`; added auto-join creator in createCircle() when creator address is in payoutOrder; 57/57 Foundry tests pass
- **v6 Deployed:** 2026-10-20T06:13:38Z — same address as v5; redeployed to include corrected ABI (getPayoutOrder, getPeriod, startCircle, joinCircle were missing)
- **v5 Deployed:** 2026-10-19T21:23:40Z (superseded — ABI was stale, do not use)
- **v4 Deployed:** 2026-10-18T19:04:24Z (superseded — do not use)
- **v3 Deployed:** 2026-10-18T18:50:32Z (superseded — do not use)
- **v2 Deployed:** 2026-10-17T19:16:07Z (superseded — do not use)
- **v1 Deployed:** 2026-10-17T18:29:15Z (superseded — do not use)

## Source Files

| File | Description |
|---|---|
| `contracts/AdasheCircle.sol` | Main contract |
| `contracts/test/AdasheCircle.t.sol` | Foundry unit tests (52 tests, all pass) |
| `contracts/contract-metadata/AdasheCircle.json` | Deployment metadata + full ABI |
| `contracts/out/AdasheCircle.sol/AdasheCircle.json` | Compiled artifact |
| `foundry.toml` | Foundry config (Paris EVM, OZ 5.1.0) |
| `init.md` | Full product specification |
| `README.md` | Local setup, Vercel deployment, contract notes |
| `docs/architecture.md` | Stack, env vars, PIN security, known limitations |
| `.env.example` | All required env vars with descriptions |
| `prisma/schema.prisma` | PostgreSQL schema (Invite, CirclePin, PinAttempt, Notification) |
| `src/` | Next.js 14 App Router frontend + API routes |

## Frontend Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS
- wagmi v2 + ConnectKit (Arc Testnet, WalletConnect)
- PostgreSQL + Prisma (invites, PIN, notifications)
- Design tokens: ivory `#F5F0E6`, forest `#244B3C`, terracotta `#C77D55`
- 0 TypeScript errors, 0 ESLint errors (verified 2026-10-18)
- Foundry tests: 57/57 pass (v7)

## Constructor Args

```
AdasheCircle(address usdcAddress)
usdcAddress = 0x3600000000000000000000000000000000000000
```

## Frontend Build

**Framework:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS v3
**Dev server:** port 5173 (`bun run dev` → `next dev -p 5173`)
**Stack:** wagmi v2 + ConnectKit, viem, TanStack Query, Prisma + PostgreSQL, iron-session, bcryptjs

### Key files
| Path | Description |
|------|-------------|
| `src/lib/contract.ts` | ABI import, contract address, enum mirrors, explorer helpers |
| `src/lib/usdc.ts` | USDC address, ERC-20 ABI, formatUsdc, parseUsdc |
| `src/lib/wagmi.ts` | wagmiConfig, Arc Testnet chain definition |
| `src/lib/db.ts` | Prisma singleton |
| `src/lib/pin.ts` | Server-side PIN hashing, rate limiting |
| `src/lib/invite.ts` | Invite token create/validate/revoke |
| `src/providers/Web3Provider.tsx` | WagmiProvider + ConnectKitProvider |
| `src/app/layout.tsx` | Root layout |
| `src/app/page.tsx` | Landing page |
| `src/app/dashboard/page.tsx` | My Circles dashboard |
| `src/app/circles/new/page.tsx` | Create circle (5-step wizard) |
| `src/app/circles/[circleId]/page.tsx` | Circle detail (tabbed: overview, members, periods, my position, manage) |
| `src/app/join/[token]/page.tsx` | Invite join flow (PIN → joinCircle tx) |
| `src/app/api/circles/[circleId]/invite/route.ts` | Create/list invite tokens |
| `src/app/api/join/verify/route.ts` | Verify PIN, return circleId |
| `src/app/api/notifications/route.ts` | Get/mark-read notifications |
| `prisma/schema.prisma` | Invite, PinAttempt, CirclePin, Notification models |
| `next.config.mjs` | Next.js config; webpack alias stubs for @base-org/account chain |
| `docs/architecture.md` | Full architecture, rules, known limitations |
| `env.example` | All required environment variables |

### Required env vars before running
- `DATABASE_URL` — PostgreSQL connection string
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — WalletConnect Cloud project ID
- `SESSION_SECRET` — 32+ char random string for session cookies

### Prisma migration
After setting `DATABASE_URL`, run:
```
bunx prisma migrate dev --name init
```

### Known limitation
`repayDebt()` issues a push transfer to the creditor; if the creditor address is USDC-blocklisted on Arc,
the debtor cannot clear their debt. Documented in `docs/architecture.md`.
