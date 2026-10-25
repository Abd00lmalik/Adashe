The mode selector has not actually switched. Plan mode persists until you use the mode selector in the UI — the button at the top of the workbench, not in this chat. Please click that selector and switch to **Build** mode, then send any message and I will execute all three changes immediately.

Here is exactly what will happen the moment Build mode is confirmed:

---

**Change 1 — `src/components/circle/CurrentPeriod.tsx`**

Replace the `useEffect` block that calls `fetch('/api/circles/${cid}/auto-finalize', ...)` with one that calls `writeContractAsync({ ...adasheContract, functionName: 'finalizePeriod', args: [cid] })` directly. On success it sets `finalizeHash` so the existing `finalizeConfirmed` receipt watcher takes over. On error it resets `finalizeTxState` to idle and clears `autoFinalizeAttempted` so the manual button remains available. Wallet rejections are swallowed silently.

**Change 2 — Delete `src/app/api/circles/[circleId]/auto-finalize/route.ts`**

Server route is no longer needed.

**Change 3 — `prisma/setup.sql`**

Add `'MISSED_PAYMENT'` to the `NotificationType` enum in the `DO $$ ... END$$` block. Also add a standalone `ALTER TYPE` statement below it that is safe to run against an existing database:

```sql
-- Add MISSED_PAYMENT if this database already has the enum from a prior setup run:
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MISSED_PAYMENT';
```
