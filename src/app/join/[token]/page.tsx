'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Navbar } from '@/components/layout/Navbar'
import { ChainGuard } from '@/components/ui/ChainGuard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { adasheContract, CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { Loader2, CheckCircle2, ExternalLink, AlertTriangle, Lock, ShieldX } from 'lucide-react'
import { explorerTx } from '@/lib/contract'

type JoinStep =
  | 'connect'        // wallet not connected
  | 'checking'       // on-chain eligibility check in progress
  | 'ineligible'     // wallet not in payout order
  | 'pin'            // eligible — enter PIN
  | 'verified'       // PIN correct — ready to join
  | 'signing'        // awaiting wallet signature
  | 'confirming'     // tx submitted, waiting for receipt
  | 'success'        // tx confirmed on-chain
  | 'error'          // tx failed

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const { address, isConnected } = useAccount()
  const router = useRouter()
  const publicClient = usePublicClient()

  const [step, setStep] = useState<JoinStep>('connect')
  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [circleId, setCircleId] = useState<string | null>(null)
  const [txHash, setTxHash] = useState('')
  const [txError, setTxError] = useState('')
  // Track the address that was eligibility-checked so a wallet switch re-triggers the check
  const [checkedAddress, setCheckedAddress] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  // When wallet connects (or switches), run the on-chain eligibility check.
  // We first need to resolve the circleId from the token.
  useEffect(() => {
    if (!isConnected || !address) {
      setStep('connect')
      setCheckedAddress(null)
      return
    }
    // Don't re-run if we already checked this address
    if (checkedAddress === address.toLowerCase()) return

    setStep('checking')
    setVerifyError('')
    setCircleId(null)

    // Resolve circleId from the invite token, then check eligibility on-chain
    const check = async () => {
      try {
        // Resolve the invite token to get the circleId
        const resolveRes = await fetch('/api/join/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const resolveData = await resolveRes.json()
        if (!resolveRes.ok) {
          setVerifyError(resolveData.error ?? 'Invalid or expired invitation link.')
          setStep('ineligible')
          setCheckedAddress(address.toLowerCase())
          return
        }
        const resolvedCircleId: string = resolveData.circleId

        // Check eligibility on-chain via wagmi publicClient
        if (!publicClient) {
          setVerifyError('No RPC connection available.')
          setStep('ineligible')
          setCheckedAddress(address.toLowerCase())
          return
        }
        const eligible = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'isInPayoutOrder',
          args: [BigInt(resolvedCircleId), address as `0x${string}`],
        }) as boolean

        setCheckedAddress(address.toLowerCase())

        if (!eligible) {
          setStep('ineligible')
          return
        }

        // Eligible — store circleId and move to PIN step
        setCircleId(resolvedCircleId)
        setStep('pin')
      } catch (err) {
        console.error('Eligibility check failed:', err)
        setVerifyError('Could not verify eligibility. Please try again.')
        setStep('ineligible')
        setCheckedAddress(address.toLowerCase())
      }
    }
    check()
  }, [isConnected, address, checkedAddress, token, publicClient])

  const handleVerifyPin = async () => {
    if (!address || !circleId) return
    setVerifyError('')
    setVerifying(true)
    try {
      const res = await fetch('/api/join/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, wallet: address }),
      })
      const data = await res.json()
      if (!res.ok) {
        setVerifyError(data.error ?? 'Verification failed')
        return
      }
      setStep('verified')
    } catch {
      setVerifyError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleJoin = async () => {
    if (!circleId || !address) return

    // Final eligibility re-check before submitting the tx (prevents stale state)
    if (!publicClient) { setTxError('No RPC connection.'); setStep('error'); return }
    try {
      const stillEligible = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'isInPayoutOrder',
        args: [BigInt(circleId), address as `0x${string}`],
      }) as boolean
      if (!stillEligible) {
        setTxError('Your wallet is no longer eligible for this circle.')
        setStep('error')
        return
      }
    } catch {
      // If we can't recheck, proceed — the contract will reject if ineligible
    }

    setStep('signing')
    setTxError('')
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'joinCircle',
        args: [BigInt(circleId)],
      })
      setTxHash(hash)
      setStep('confirming')

      // Wait for actual on-chain confirmation
      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      setStep('success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      const clean = msg.includes('User rejected') || msg.includes('user rejected')
        ? 'You rejected the transaction.'
        : msg.includes('already joined')
        ? 'You have already joined this circle.'
        : msg.includes('not in payout order')
        ? 'Your wallet is not assigned to this circle.'
        : 'Transaction failed. The contract rejected the join.'
      setTxError(clean)
      setStep('error')
    }
  }

  return (
    <div className="min-h-dvh bg-ivory-DEFAULT">
      <Navbar />
      <main
        className="mx-auto max-w-md px-4 sm:px-6 py-10 pb-safe"
        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
      >
        <Card>
          <CardHeader>
            <div className="rounded-full bg-forest-50 p-3 w-fit mb-2">
              <Lock className="h-5 w-5 text-forest-500" />
            </div>
            <CardTitle>Join a Circle</CardTitle>
            <CardDescription>
              You have been invited to join a private savings circle.
              Connect the wallet assigned to your position to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Step: connect wallet */}
            {step === 'connect' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-muted text-center">
                  Connect the wallet address that was assigned to your position in this circle.
                </p>
                <ConnectKitButton />
              </div>
            )}

            {/* Step: checking eligibility */}
            {step === 'checking' && (
              <div className="flex items-center gap-2 text-sm text-muted py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking wallet eligibility…
              </div>
            )}

            {/* Step: ineligible */}
            {step === 'ineligible' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                  <ShieldX className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-red-800">
                      {verifyError || 'This wallet is not assigned to a position in this circle.'}
                    </p>
                    <p className="text-xs text-red-700">
                      Only wallet addresses explicitly assigned during circle creation may join.
                      Connect the correct wallet to continue.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-muted">Try a different wallet</p>
                  <ConnectKitButton />
                </div>
              </div>
            )}

            {/* Step: PIN entry */}
            {(step === 'pin') && (
              <ChainGuard>
                <div className="space-y-4">
                  <div className="rounded-xl bg-forest-50 border border-forest-200 p-3 flex items-center gap-2 text-sm text-forest-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-forest-500" />
                    Wallet verified as a circle member.
                  </div>
                  <div>
                    <Label htmlFor="pin">Circle PIN</Label>
                    <Input
                      id="pin"
                      type="password"
                      inputMode="text"
                      placeholder="Enter the PIN from your invitation"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="mt-1.5"
                      autoComplete="current-password"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPin() }}
                    />
                    <p className="text-xs text-muted mt-1">
                      The PIN was shared by the circle creator. It restricts access through the app.
                    </p>
                  </div>
                  {verifyError && (
                    <div className="flex items-center gap-2 text-sm text-danger">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> {verifyError}
                    </div>
                  )}
                  <Button className="w-full" onClick={handleVerifyPin} disabled={verifying || !pin}>
                    {verifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : 'Verify PIN'}
                  </Button>
                </div>
              </ChainGuard>
            )}

            {/* Step: PIN verified — ready to join */}
            {step === 'verified' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  PIN verified. You are cleared to join Circle #{circleId}.
                </div>
                <p className="text-sm text-muted text-pretty">
                  Click below to complete membership. You are pre-approved automatically.
                  The creator will start the circle once everyone has joined.
                </p>
                <Button className="w-full" onClick={handleJoin}>
                  Join Circle #{circleId}
                </Button>
              </div>
            )}

            {/* Step: signing */}
            {step === 'signing' && (
              <div className="flex items-center gap-2 text-sm text-muted py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Awaiting wallet signature…
              </div>
            )}

            {/* Step: confirming */}
            {step === 'confirming' && (
              <div className="flex items-center gap-2 text-sm text-muted py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Confirming on-chain…
                {txHash && (
                  <a href={explorerTx(txHash)} target="_blank" rel="noopener noreferrer" className="text-terra-400 hover:underline flex items-center gap-1 ml-1">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {/* Step: success */}
            {step === 'success' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> You have joined the circle!
                </div>
                <p className="text-xs text-muted text-pretty">
                  The creator will start the circle once all members have joined.
                  You will be able to contribute immediately after the circle starts.
                </p>
                {txHash && (
                  <a href={explorerTx(txHash)} target="_blank" rel="noopener noreferrer" className="text-xs text-terra-400 hover:underline flex items-center gap-1">
                    View transaction <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button variant="secondary" className="w-full" onClick={() => router.push('/dashboard')}>
                  Go to dashboard
                </Button>
              </div>
            )}

            {/* Step: error */}
            {step === 'error' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {txError}
                </div>
                <Button variant="outline" className="w-full" onClick={() => setStep('verified')}>
                  Try again
                </Button>
              </div>
            )}

          </CardContent>
        </Card>
      </main>
    </div>
  )
}
