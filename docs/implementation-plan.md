Reading the full implementation before touching anything. Now I can see the core issues clearly. Let me read the rest of CreatorPanel and the circle page: Now I have a complete picture. Let me read the `contribute` function and check the exact payment enforcement: Now I have everything I need. Let me write up the complete diagnosis:

**Issue 1 — Cycle start does not persist:**
`handleStartCircle` in `CreatorPanel.tsx` lines 198–199 sets `confirming` then immediately sets `success` on the next line without waiting for the receipt. So the UI shows "success" before the transaction is even mined. When you navigate away, `startTxState` resets to `{ status: 'idle' }` (it's React state). The circle page re-fetches `circles(cid)` with `staleTime: 10_000` — if the tx hasn't confirmed yet and the cache is stale, `status` still shows PENDING, so `isPending = true` and the Start button reappears. The fix: use `useWaitForTransactionReceipt` and then `refetch()` the circle data before showing success.

**Issue 2 — No visible contribution flow:**
The contribution flow EXISTS in `CurrentPeriod.tsx` (lines 191–204) but `canContribute` (line 105) requires `contribution?.status === 0 && contribution?.paidAmount === 0n`. The `contribution` object comes from `getContribution(cid, periodIndex, address)`. If `address` is undefined at first render (wallet just connected), the `getContribution` call is skipped (`contracts` array only has `getPeriod`), so `contributionData` is always null, `contribution` is null, and `canContribute = false`. The contribute button never shows. Fix: ensure address is always passed and the conditional spread uses the correct index.

**Issue 3 — Exact payment enforcement:**
The contract ALREADY enforces exact payment: `usdc.safeTransferFrom(msg.sender, address(this), c.contributionAmount)` — it always transfers exactly `contributionAmount`. There's no user-supplied amount. The UI already submits the exact amount via `UsdcApproveAndAction`. This is correctly implemented. No contract change needed.

The only real issues are Issues 1 and 2. Fixing them now: **Fix Issue 1 — `handleStartCircle` must wait for the receipt then refetch the page's circle data:**

`CreatorPanel` doesn't have access to the page-level `refetch`. The cleanest fix is to use wagmi's `useWaitForTransactionReceipt` hook keyed on the start tx hash, and then force the page to reload circle data by having the circle page pass a `refetch` callback down, or by using a wagmi `queryClient.invalidateQueries`. The simplest correct fix: use `useWaitForTransactionReceipt` in `CreatorPanel` for the start tx hash, and call `window.location.reload()` only after the receipt confirms — that guarantees fresh contract state:I'm in Plan mode. Here is the complete, precise implementation plan — approve it and it executes immediately:

---

## Fix specification

### Fix 1 — `CreatorPanel.tsx`: `handleStartCircle` — wait for receipt before success

**Current bug (lines 192–204):**
```ts
const hash = await writeContractAsync({ ... functionName: 'startCircle', args: [cid] })
setStartTxState({ status: 'confirming', hash })
setStartTxState({ status: 'success', hash })  // ← immediately success, no receipt wait
toast.success('Circle started!')
```

**Fix:**
1. Add `useWaitForTransactionReceipt` and `useQueryClient` imports
2. Store the start tx hash in a separate `useState<string>`: `const [startHash, setStartHash] = useState<string | undefined>()`
3. Use `useWaitForTransactionReceipt({ hash: startHash })` — when `isSuccess` becomes true, call `queryClient.invalidateQueries()` to force the circle data to refetch, then set `setStartTxState({ status: 'success', hash: startHash })`
4. In `handleStartCircle`: after `writeContractAsync`, only set `confirming` — let the receipt hook handle `success`
5. In the Start Circle button: disable it when `status === CircleStatus.ACTIVE` (already started on-chain) regardless of local tx state

**Same fix applies to `handleApprove`, `handleRemove`, `handleReplace` — they also set success immediately. Fix them all to at minimum call `refetch()` after the tx hash is confirmed.**

### Fix 2 — `CurrentPeriod.tsx`: `canContribute` — fix the conditional index bug

**Current bug (lines 39–51):**
```ts
const { data, isLoading, refetch } = useReadContracts({
  contracts: [
    { ...adasheContract, functionName: 'getPeriod', args: [cid, periodIndex] },
    ...(address
      ? [{ ...adasheContract, functionName: 'getContribution', args: [cid, periodIndex, address] }]
      : []),  // ← when address undefined on first render, data[1] doesn't exist
  ],
})
const contributionData = data?.[1]?.status === 'success' ? data[1].result : null
```

When `address` is initially undefined (wagmi hasn't loaded yet), the contracts array has only 1 element. When `address` later resolves, wagmi fires a new read with 2 elements — but there's a brief window where `data` has stale shape. More importantly: the `canContribute` check at line 105 requires `contribution?.status === 0` — but `contribution` is typed as an object with a `status` field, while `contributionData` is the raw return value of `getContribution`. Let me check what `getContribution` actually returns in the ABI.

**The real bug**: `getContribution` in the contract returns a `ContributionRecord` struct. The `contribution` object is cast as `{ status: number; paidAmount: bigint; ... }`. If the address is in the circle but hasn't contributed yet, `status = 0` (PENDING) and `paidAmount = 0n` — this should make `canContribute = true`. But the `canContribute` check also has `contribution?.status === 0` — if `contribution` is `null` (address was initially undefined), `canContribute = false`.

**Fix**: Remove the conditional spread. Always include the `getContribution` call — when `address` is undefined, pass a zero address as placeholder and check `!!address` separately in `canContribute`. Or better: add a `query: { enabled: !!address }` to the whole hook but always include both contracts, and gate `canContribute` on `!!address`:

```ts
const contracts = [
  { ...adasheContract, functionName: 'getPeriod', args: [cid, periodIndex] },
  { ...adasheContract, functionName: 'getContribution', args: [cid, periodIndex, (address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`] },
] as const

const { data, isLoading, refetch } = useReadContracts({ contracts, query: { staleTime: 15_000 } })
// data[0] = period, data[1] = contribution (always at index 1)
const contributionData = data?.[1]?.status === 'success' ? data[1].result : null
```

And fix `canContribute`:
```ts
const canContribute = !!address && !isRecipient && !deadlinePast && (
  contributionData === null ||  // not yet loaded
  (contribution?.status === 0 && (contribution?.paidAmount ?? 0n) === 0n)
)
```

Wait — if `contributionData === null` we should NOT show contribute (data still loading). Better:
```ts
const hasPaid = contribution !== null && (contribution.status !== 0 || (contribution.paidAmount ?? 0n) > 0n)
const canContribute = !!address && !isRecipient && !deadlinePast && contributionData !== null && !hasPaid
```

### Fix 3 — Exact payment: already enforced

The contract `contribute()` always transfers exactly `c.contributionAmount` — there is no user-supplied amount. The UI already passes `contributionAmount` to `UsdcApproveAndAction`. No change needed.

**Also fix `handleContribute` receipt polling**: replace the manual `setInterval` with `useWaitForTransactionReceipt` for correctness. The poll currently checks `updated.status !== 0` on the contribution data — but if the refetch returns stale data, the interval never clears. Replace with the wagmi hook.

### Also fix all "immediate success" patterns in CreatorPanel

The same `confirming → success` in one line pattern affects:
- `handleApprove` (lines 134–135)
- `handleRemove` (lines 153–154)
- `handleReplace` (lines 176–177)

All should: set `confirming`, then call `await refetch()` after a brief delay (or use `useWaitForTransactionReceipt`). Simplest safe fix that doesn't require per-tx hooks: after `writeContractAsync` returns a hash, `await` a 4-second timeout then call `refetch()` and set success.

### No contract change required

The contract is correct:
- `contribute()` enforces exact payment, prevents duplicates, rejects the recipient paying for their own period, rejects non-members
- `startCircle()` is gated on PENDING status (prevents double-start)
- Payment amounts are always exact

### Files to change

1. `src/components/circle/CreatorPanel.tsx` — fix `handleStartCircle` (receipt wait + invalidate), fix `handleApprove`/`handleRemove`/`handleReplace` (receipt wait)
2. `src/components/circle/CurrentPeriod.tsx` — fix `canContribute` (index bug, `hasPaid` logic), fix `handleContribute` (use wagmi receipt hook)
3. Tests in `src/__tests__/circle-lifecycle.test.ts`

Switch to Build mode to apply.
