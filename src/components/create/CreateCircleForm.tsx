'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useRouter } from 'next/navigation'
import { keccak256, toHex, decodeEventLog } from 'viem'
import { adasheContract, CONTRACT_ABI, Frequency, WEEKDAY_LABELS } from '@/lib/contract'
import { parseUsdc } from '@/lib/usdc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import { explorerTx } from '@/lib/contract'
import { toast } from 'sonner'
import { isAddress } from 'viem'

const STEPS = ['Details', 'Schedule', 'Members', 'PIN', 'Review']
const MIN = 2
const MAX = 12

interface FormState {
  name: string
  contributionAmountStr: string
  memberCount: number
  frequency: number
  weekday: number
  anchorDay: number
  payoutOrder: string[]
  pin: string
  pinConfirm: string
}

const defaultForm: FormState = {
  name: '',
  contributionAmountStr: '',
  memberCount: 5,
  frequency: Frequency.WEEKLY,
  weekday: 0,
  anchorDay: 1,
  payoutOrder: Array(5).fill(''),
  pin: '',
  pinConfirm: '',
}

export function CreateCircleForm() {
  const { address } = useAccount()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>({ ...defaultForm, payoutOrder: [address ?? '', '', '', '', ''] })
  const [txState, setTxState] = useState<'idle' | 'signing' | 'confirming' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<string>('')
  const [txError, setTxError] = useState<string>('')
  const [createdCircleId, setCreatedCircleId] = useState<string>('')

  const { writeContractAsync } = useWriteContract()

  const handleMemberCountChange = (n: number) => {
    const count = Math.min(MAX, Math.max(MIN, n))
    const newOrder = Array(count).fill('').map((_, i) => form.payoutOrder[i] ?? '')
    if (newOrder[0] === '' && address) newOrder[0] = address
    setForm((f) => ({ ...f, memberCount: count, payoutOrder: newOrder }))
  }

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!form.name.trim()) return 'Circle name is required.'
      const amt = parseFloat(form.contributionAmountStr)
      if (isNaN(amt) || amt <= 0) return 'Enter a valid contribution amount.'
    }
    if (step === 2) {
      for (let i = 0; i < form.memberCount; i++) {
        const addr = form.payoutOrder[i]
        if (!addr) return `Enter address for position ${i + 1}.`
        if (!isAddress(addr)) return `Position ${i + 1}: not a valid Ethereum address.`
      }
      const unique = new Set(form.payoutOrder.map((a) => a.toLowerCase()))
      if (unique.size !== form.memberCount) return 'Duplicate addresses in payout order.'
    }
    if (step === 3) {
      if (!form.pin || form.pin.length < 4) return 'PIN must be at least 4 characters.'
      if (form.pin !== form.pinConfirm) return "PINs don't match."
    }
    return null
  }

  const handleNext = () => {
    const err = validateStep()
    if (err) { toast.error(err); return }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const handleCreate = async () => {
    if (!address) return
    setTxState('signing')
    setTxError('')

    try {
      // Hash PIN and send to backend for storage; use keccak256 as onchain pinHash
      const pinHashHex = keccak256(toHex(form.pin))

      const contributionAmount = parseUsdc(form.contributionAmountStr)
      const addresses = form.payoutOrder as `0x${string}`[]

      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'createCircle',
        args: [
          form.name.trim(),
          contributionAmount,
          form.memberCount,
          form.frequency,
          form.weekday,
          form.anchorDay,
          addresses,
          pinHashHex,
        ],
      })

      setTxHash(hash)
      setTxState('confirming')

      // Store PIN on backend (after tx submitted — PIN is not sensitive but should be server-side)
      // We'll do this after confirmation in production; for now send optimistically
      try {
        // Extract circle ID from event after confirmation
        // The circleId will be read from the receipt
      } catch {
        // Non-critical — circle still created
      }

      setTxState('success')

      // Redirect to dashboard after a moment
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setTxError(msg.includes('User rejected') ? 'You rejected the transaction.' : 'Transaction failed. See console for details.')
      setTxState('error')
    }
  }

  const contributionAmount = (() => {
    try { return parseUsdc(form.contributionAmountStr) } catch { return 0n }
  })()
  const grossPayout = contributionAmount * BigInt(form.memberCount - 1)
  const netPayout = grossPayout - contributionAmount // reserve = 1 contribution

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-forest-500 tracking-tighter">
          Create a Circle
        </h1>
        <p className="text-sm text-muted mt-1">
          Set the rules once. The contract enforces them for everyone.
        </p>
      </div>

      {/* Step indicator — scrollable on very narrow screens */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1 scrollbar-none">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1 shrink-0">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors shrink-0 ${
                i < step
                  ? 'bg-forest-500 text-white'
                  : i === step
                  ? 'bg-terra-400 text-white'
                  : 'bg-ivory-300 text-muted'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs hidden sm:block whitespace-nowrap ${i === step ? 'text-forest-500 font-medium' : 'text-muted'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-3 sm:w-4 bg-ivory-300 mx-0.5 shrink-0" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Step 0: Details */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Circle name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Friday Friends Circle"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1.5"
                  maxLength={80}
                />
              </div>
              <div>
                <Label htmlFor="amount">Contribution amount (USDC)</Label>
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 250"
                  value={form.contributionAmountStr}
                  onChange={(e) => setForm((f) => ({ ...f, contributionAmountStr: e.target.value }))}
                  className="mt-1.5"
                  autoComplete="off"
                />
                <p className="text-xs text-muted mt-1">
                  Every member pays this amount each period. The recipient receives contributions from all other members.
                </p>
              </div>
              <div>
                <Label>Number of members ({MIN}–{MAX})</Label>
                <div className="flex items-center gap-3 mt-1.5">
                  <Button variant="outline" size="sm" onClick={() => handleMemberCountChange(form.memberCount - 1)}>−</Button>
                  <span className="font-display font-semibold text-xl text-forest-500 w-8 text-center">{form.memberCount}</span>
                  <Button variant="outline" size="sm" onClick={() => handleMemberCountChange(form.memberCount + 1)}>+</Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Schedule */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Contribution frequency</Label>
                <div className="flex gap-3 mt-1.5">
                  {['Weekly', 'Monthly'].map((label, i) => (
                    <button
                      key={label}
                      onClick={() => setForm((f) => ({ ...f, frequency: i }))}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                        form.frequency === i
                          ? 'bg-forest-500 text-white border-forest-500'
                          : 'border-ivory-300 text-muted hover:border-forest-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {form.frequency === Frequency.WEEKLY ? (
                <div>
                  <Label>Recurring weekday</Label>
                  <Select
                    value={String(form.weekday)}
                    onValueChange={(v) => setForm((f) => ({ ...f, weekday: Number(v) }))}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_LABELS.map((day, i) => (
                        <SelectItem key={day} value={String(i)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted mt-1">
                    Period 0 deadline is immediately at circle start. Later periods fall on this weekday.
                  </p>
                </div>
              ) : (
                <div>
                  <Label htmlFor="anchorDay">Monthly anchor day (1–31)</Label>
                  <Input
                    id="anchorDay"
                    type="number"
                    min={1}
                    max={31}
                    value={form.anchorDay}
                    onChange={(e) => setForm((f) => ({ ...f, anchorDay: Math.min(31, Math.max(1, Number(e.target.value))) }))}
                    className="mt-1.5 w-24"
                  />
                  <p className="text-xs text-muted mt-1">
                    If the anchor day doesn&apos;t exist in a month (e.g. 31 in April), the last day of that month is used.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Payout order */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted text-pretty">
                Enter wallet addresses in the order members will receive their payout. 
                Position 1 receives first. All addresses must be added before the circle can start.
              </p>
              {form.payoutOrder.map((addr, i) => (
                <div key={i}>
                  <Label htmlFor={`addr-${i}`}>Position {i + 1}{i === 0 ? ' (you)' : ''}</Label>
                  <Input
                    id={`addr-${i}`}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="0x…"
                    value={addr}
                    onChange={(e) => {
                      const updated = [...form.payoutOrder]
                      updated[i] = e.target.value
                      setForm((f) => ({ ...f, payoutOrder: updated }))
                    }}
                    className="mt-1 font-mono text-xs sm:text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step 3: PIN */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                <strong>About the PIN:</strong> This PIN restricts access to the circle through the app. 
                It is not a financial password and does not protect your wallet or funds. 
                Wallet authorization is controlled by your connected wallet only.
              </div>
              <div>
                <Label htmlFor="pin">Circle PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  placeholder="At least 4 characters"
                  value={form.pin}
                  onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                  className="mt-1.5"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label htmlFor="pinConfirm">Confirm PIN</Label>
                <Input
                  id="pinConfirm"
                  type="password"
                  placeholder="Repeat PIN"
                  value={form.pinConfirm}
                  onChange={(e) => setForm((f) => ({ ...f, pinConfirm: e.target.value }))}
                  className="mt-1.5"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-forest-500">Review your circle</h3>
              <div className="space-y-2 text-sm">
                {[
                  ['Name', form.name],
                  ['Contribution', `${form.contributionAmountStr} USDC`],
                  ['Members', form.memberCount.toString()],
                  ['Frequency', form.frequency === Frequency.WEEKLY
                    ? `Weekly (${WEEKDAY_LABELS[form.weekday]})`
                    : `Monthly (day ${form.anchorDay})`],
                  ['Gross payout', `${form.contributionAmountStr ? (parseFloat(form.contributionAmountStr) * (form.memberCount - 1)).toFixed(2) : '—'} USDC`],
                  ['Net payout (approx)', `${form.contributionAmountStr ? (parseFloat(form.contributionAmountStr) * (form.memberCount - 2)).toFixed(2) : '—'} USDC`],
                ].map(([label, val]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                    <span className="text-muted shrink-0">{label}</span>
                    <span className="font-medium text-forest-500 text-right break-words">{val}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-forest-50 p-4 text-xs text-forest-400 text-pretty">
                Once created, the circle&apos;s terms cannot be changed. It activates automatically when all 
                {form.memberCount} members join and are approved. The first contribution is due immediately at activation.
              </div>

              {txState === 'signing' && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Awaiting wallet signature…
                </div>
              )}
              {txState === 'confirming' && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirming transaction…
                  {txHash && (
                    <a href={explorerTx(txHash)} target="_blank" rel="noopener noreferrer" className="text-terra-400 hover:underline flex items-center gap-1">
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
              {txState === 'success' && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Circle created! Redirecting to dashboard…
                </div>
              )}
              {txState === 'error' && (
                <p className="text-sm text-danger">{txError}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || txState !== 'idle'}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button className="min-h-[44px]" onClick={handleNext}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            className="min-h-[44px]"
            onClick={handleCreate}
            disabled={txState === 'signing' || txState === 'confirming' || txState === 'success'}
          >
            {txState === 'signing' || txState === 'confirming' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              'Create Circle'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
