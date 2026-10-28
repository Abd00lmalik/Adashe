# Adashe — Mainnet Deployment Guide

This guide covers every step required to deploy Adashe to Arc Mainnet.
Complete every step in order. Do not skip the audit or the dry-run.

---

## Prerequisites

- [ ] You have completed an independent professional smart contract security audit
- [ ] You have a hardware wallet or a dedicated deployer EOA with Arc mainnet USDC for gas
- [ ] You have a production Supabase project (separate from your test database)
- [ ] You have a Vercel project connected to this repository
- [ ] You have a WalletConnect project ID from https://cloud.walletconnect.com
- [ ] Foundry is installed (`foundryup`)

---

## Step 1 — Get the Arc Mainnet USDC address

1. Go to https://docs.arc.io and find the official USDC contract address on Arc Mainnet.
2. Also check https://developers.circle.com/stablecoins/usdc-on-arc to cross-verify.
3. Write it down. You will need it as a constructor argument.

> Do not use the testnet address `0x3600000000000000000000000000000000000000` on mainnet.

---

## Step 2 — Fill in the deploy script

Open `contracts/script/DeployMainnet.s.sol` and replace the placeholder:

```solidity
address constant USDC_MAINNET = address(0); // <-- REPLACE THIS
```

With the verified Arc Mainnet USDC address from Step 1.

---

## Step 3 — Dry-run the deployment (no broadcast)

```bash
# Export your deployer private key — do NOT paste it directly in the command
export DEPLOYER_PRIVATE_KEY=0x<your private key>

# Dry-run — reads chain state, simulates the deployment, prints the address
forge script contracts/script/DeployMainnet.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Verify the output:
- Chain ID shown is `1514`
- Deployer address is your wallet
- USDC address matches what you verified in Step 1
- No errors or reverts

---

## Step 4 — Broadcast the deployment

Only proceed after the dry-run output looks correct.

```bash
forge script contracts/script/DeployMainnet.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

Copy the deployed contract address from the output. It will look like:
```
AdasheCircle deployed at: 0x...
Set NEXT_PUBLIC_CONTRACT_ADDRESS = 0x...
```

Save this address. You will use it in Step 6.

---

## Step 5 — Set up the production database

1. Create a new Supabase project at https://supabase.com (use a separate project from your test database).
2. Open the SQL Editor in your Supabase dashboard.
3. Paste the full contents of `prisma/setup.sql` and run it.
4. Verify that all tables were created: `Invite`, `PinAttempt`, `CirclePin`, `Notification`.
5. Copy the two connection strings from Supabase:
   - **Prisma URL**: Settings > Database > Connection string > URI (with `?pgbouncer=true&connection_limit=1`)
   - **Direct URL**: Settings > Database > Connection string > Direct connection

---

## Step 6 — Set Vercel environment variables

In your Vercel project, go to **Settings > Environment Variables**.
Set each of the following for the **Production** environment:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_NETWORK` | `mainnet` |
| `NEXT_PUBLIC_CHAIN_ID` | `1514` |
| `NEXT_PUBLIC_ARC_MAINNET_RPC_URL` | `https://rpc.mainnet.arc.io` |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Address from Step 4 |
| `NEXT_PUBLIC_USDC_ADDRESS` | Arc mainnet USDC address from Step 1 |
| `NEXT_PUBLIC_APP_URL` | `https://adasheonchain.vercel.app` (or your custom domain) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Your WalletConnect project ID |
| `DATABASE_URL` | Prisma URL from Step 5 |
| `DIRECT_URL` | Direct URL from Step 5 |
| `SESSION_SECRET` | Run `openssl rand -hex 32` and paste the output |
| `RPC_URL` | `https://rpc.mainnet.arc.io` |

> The `NEXT_PUBLIC_ARC_TESTNET_RPC_URL` variable is no longer needed for production but harmless to leave.

---

## Step 7 — Update WalletConnect allowed domains

1. Go to https://cloud.walletconnect.com
2. Open your project.
3. Under **Allowed Domains**, add your production domain (e.g. `adasheonchain.vercel.app`).

---

## Step 8 — Deploy to Vercel

Push your latest changes to the main branch, or trigger a manual deploy in the Vercel dashboard.

After the deploy completes:
1. Open the production URL in a browser.
2. Connect a wallet.
3. Verify the chain shown is **Arc** (not Arc Testnet).
4. Verify the USDC address in the network matches what you set.
5. Create a test circle with a small contribution amount to verify the full flow works on mainnet before announcing publicly.

---

## Step 9 — Verify the contract (optional but recommended)

```bash
forge verify-contract \
  <deployed address> \
  contracts/AdasheCircle.sol:AdasheCircle \
  --rpc-url https://rpc.mainnet.arc.io \
  --constructor-args $(cast abi-encode "constructor(address)" <USDC_MAINNET>)
```

A verified contract allows users and auditors to read the source on the Arc explorer.

---

## Post-deployment checklist

- [ ] Contract address set in Vercel and verified on explorer
- [ ] Production database running with correct schema
- [ ] Test circle created and contribution + payout flow verified end-to-end
- [ ] No testnet addresses or chain IDs in production logs or UI
- [ ] WalletConnect allowed domains updated
- [ ] Monitoring set up (optional: Tenderly, OpenZeppelin Defender, or a custom webhook)

---

## Rollback

If a critical bug is found post-launch:

1. The contract has no upgrade mechanism (by design). A fix requires deploying a new contract.
2. Set `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel to the new address and redeploy.
3. Existing circles on the old contract continue to work — users must be notified to use the new address for new circles.
4. For in-flight circles, the old contract remains accessible at its address indefinitely.

---

## Security contacts

If you discover a vulnerability in the deployed contract, do not post it publicly.
Contact the development team through a private channel before disclosure.
