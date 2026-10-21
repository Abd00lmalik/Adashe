Starting with a full trace of the PIN system before touching anything. I can see the code now. The PIN storage looks correct in isolation. Let me check the `circleId` extraction more carefully — specifically what value `circleIdFromEvent` gets and whether there's any issue with the contract's `createCircle` return value, plus check the `createCircle` function signature to see how `circleId` is assigned: Now I have the complete picture. Let me check the contract's `_nextCircleId` initialization to understand circleId values: Now I have the complete picture. Let me check the `CreateCircleForm` from the beginning to see `form.pin` and the step where the circle is created: Now I have the full picture. Let me check one more thing — does the `pin/route.ts` POST handler have the correct `circleId` extraction path, and specifically, is there a race condition with the `circleId` being `null` when two circles are created quickly: I now have complete evidence. Let me document the root cause precisely, then implement the fix.

---

**Confirmed root cause:**

The bug is in `CreateCircleForm.tsx` lines 155–167. After the `createCircle` transaction confirms, the code:

1. Decodes the `CircleCreated` event from the receipt to get `circleIdFromEvent`
2. **Only stores the PIN if `circleIdFromEvent` is non-null** — but if event decoding fails for any reason (wrong ABI, log ordering, decode error), `circleIdFromEvent` stays `null` and the PIN is never stored

But more critically: the `decodeEventLog` loop tries **every log** in the receipt. On Arc Testnet, a USDC transfer (the reserve deposit) also emits logs. If the decode throws for any log (which the `catch` swallows silently), and if by chance the `CircleCreated` log is never found, `circleIdFromEvent` is `null`.

**The actual interference bug:** The second circle is created, the PIN is stored with `circleId = "2"`. Now circle 1's verify request hits `db.circlePin.findUnique({ where: { circleId: "1" } })`. If circle 1's PIN was stored correctly, this works. BUT: if the `circleIdFromEvent` was `null` for circle 1 (decode failure), circle 1 has **no PIN record** — the verify route returns 503 "Circle PIN is not yet configured."

There's also a second issue: `circleId` starts at 1 and increments — but **every redeployment resets it to 1**. So a circle created under the old contract at address v6 with `circleId=1` has a `CirclePin` record with `circleId="1"`. A new circle created under v7 also gets `circleId=1`. The PIN record `{ circleId: "1" }` is overwritten by the second creation attempt — except the `pin/route.ts` has an idempotency guard that **prevents overwriting**. So the first circle's PIN persists, but the second circle's PIN is silently rejected as "already set".

This means after redeployment, `circleId="1"` is taken by the first circle ever created on v7. A second circle (also `circleId="1"` because it was created on v6 which also started at 1) tries to store its PIN, gets `{ stored: false, reason: 'PIN already set' }`, and its PIN is **never stored**. Verification then returns 503.

**Root cause summary:** `circleId` is not globally unique across contract deployments. A `CirclePin` record for `circleId="1"` from a v6-era circle blocks PIN storage for a v7-era circle with the same `circleId`. The fix must scope `CirclePin` records to a specific contract address, not just `circleId`. Now implementing the fix. The schema needs a composite primary key `(contractAddress, circleId)` instead of just `circleId`. This is a database schema change — I'll add the migration SQL to `prisma/setup.sql` and update the Prisma schema, then update every reference.

**Step 1: Update Prisma schema**I'm in Plan mode. Let me finish the full plan document so you can approve it in one pass.

---

## Full Fix Plan: PIN isolation by (contractAddress, circleId)

### Root cause (evidence-based)

The `CirclePin` table uses `circleId` as its sole primary key. Contract IDs start at 1 on every deployment. When two different contract versions are both used (v6 and v7 both start counting from `circleId=1`), the first circle created on v7 (`circleId=1`) stores a `CirclePin` record. A second circle created on v6 also had `circleId=1`. The idempotency guard in `/api/circles/[circleId]/pin` sees an existing record and silently returns `{ stored: false, reason: 'PIN already set' }`. The second circle's PIN is never stored. Subsequent verify requests return 503 "Circle PIN is not yet configured."

This also means two circles created on the same contract version but by different wallets (circleId=1, circleId=2) are correctly isolated — **that part works**. The bug only occurs when two different contract deployments are in use simultaneously (which is exactly the case: the app switched from v6 to v7 but the database still has v6-era records).

Secondary issue: `circleIdFromEvent` extraction in `CreateCircleForm` has no fallback — if the `CircleCreated` event decode fails silently, the PIN is never stored and no error is shown to the user.

### What changes (no contract change needed)

| Layer | Change |
|-------|--------|
| `prisma/schema.prisma` | Change `CirclePin` primary key from `@id circleId` to `@@id([contractAddress, circleId])` |
| `prisma/setup.sql` | Add migration: drop old table, create new with composite PK |
| `src/app/api/circles/[circleId]/pin/route.ts` | Read `contractAddress` from env; use composite key in all queries |
| `src/app/api/join/verify/route.ts` | Use composite key when fetching `CirclePin` |
| `src/lib/pin.ts` | Add `getCirclePin(contractAddress, circleId)` helper |
| `src/components/create/CreateCircleForm.tsx` | Add explicit error + toast if `circleIdFromEvent` is null after decode; add `CONTRACT_ADDRESS` import for the POST body |
| `prisma/migrations/001_circlepin_composite_key.sql` | New migration file for reference |

### `CirclePin` table after change

```sql
CREATE TABLE "CirclePin" (
  "contractAddress" TEXT NOT NULL,  -- lowercase contract address
  "circleId"        TEXT NOT NULL,
  "pinHash"         TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("contractAddress", "circleId")
);
```

### PIN store route change

```ts
// POST /api/circles/[circleId]/pin
const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '').toLowerCase()
const existing = await db.circlePin.findUnique({
  where: { contractAddress_circleId: { contractAddress, circleId } }
})
// ...
await db.circlePin.create({ data: { contractAddress, circleId, pinHash } })
```

### PIN verify route change

```ts
const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '').toLowerCase()
const circlePin = await db.circlePin.findUnique({
  where: { contractAddress_circleId: { contractAddress, circleId: invite.circleId } }
})
```

### CreateCircleForm fix

After the decode loop, if `circleIdFromEvent` is still null:
```ts
if (!circleIdFromEvent) {
  toast.error('Circle created but could not extract circle ID from receipt. PIN not stored — members will need to contact the creator.')
  console.error('CircleCreated event not found in receipt logs:', receipt.logs)
}
```

### Supabase migration SQL (run in SQL editor)

```sql
-- Drop the old table (it has stale cross-deployment data anyway)
DROP TABLE IF EXISTS "CirclePin";

-- Recreate with composite primary key
CREATE TABLE "CirclePin" (
  "contractAddress" TEXT        NOT NULL,
  "circleId"        TEXT        NOT NULL,
  "pinHash"         TEXT        NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("contractAddress", "circleId")
);
CREATE INDEX IF NOT EXISTS "CirclePin_addr_circle_idx" ON "CirclePin"("contractAddress", "circleId");
```

After running this SQL in Supabase, redeploy to Vercel. All existing stale PIN records from old contract deployments are cleared. Each new circle creation stores its PIN scoped to the current contract address. Two circles on the same contract are isolated by circleId. Two contracts with the same circleId are isolated by contractAddress.

### Regression tests

A Jest/Vitest test file at `src/__tests__/pin-isolation.test.ts` will test:
1. Two circles on same contract, different PINs — isolated
2. Two circles with same circleId on different contract addresses — isolated
3. Correct PIN verifies; incorrect PIN fails
4. Creating second circle does not overwrite first circle's PIN
5. Missing PIN record returns 503, not false success
6. Rate limiting blocks after 5 failed attempts
7. Wallet switch clears verification state (frontend unit test)

Switch to Build mode to execute.
