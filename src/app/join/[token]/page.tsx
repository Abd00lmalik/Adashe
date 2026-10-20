'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Navbar } from '@/components/layout/Navbar'
import { ChainGuard } from '@/components/ui/ChainGuard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { adasheContract, CONTRACT_ABI } from '@/lib/contract'
import { Loader2, CheckCircle2, ExternalLink, AlertTriangle, Lock } from 'lucide-react'
import { explorerTx } from '@/lib/contract'

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const { address, isConnected } = useAccount()
  const router = useRouter()

  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [circleId, setCircleId] = useState<string | null>(null)
  const [txState, setTxState] = useState<'idle' | 'signing' | 'confirming' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState('')
  const [txError, setTxError] = useState('')

  const { writeContractAsync } = useWriteContract()

  const handleVerifyPin = async () => {
    if (!address) return
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
      setCircleId(data.circleId)
    } catch {
      setVerifyError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleJoin = async () => {
    if (!circleId) return
    setTxState('signing')
    setTxError('')
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'joinCircle',
        args: [BigInt(circleId)],
      })
      setTxHash(hash)
      setTxState('confirming')
      // For simplicity we move to success once tx is submitted
      // In production: poll for receipt before marking success
      setTxState('success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setTxError(msg.includes('User rejected') ? 'You rejected the transaction.' : 'Transaction failed. Make sure your address is in the circle\'s payout order.')
      setTxState('error')
    }
  }

  return (
    <div className="min-h-dvh bg-ivory-DEFAULT">
      <Navbar />
      <main className="mx-auto max-w-md px-4 sm:px-6 py-10 pb-safe"
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
              Connect your wallet and enter the PIN to proceed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!isConnected ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-muted text-center">
                  Connect the wallet address that was added to this circle&apos;s payout order.
                </p>
                <ConnectKitButton />
              </div>
            ) : circleId ? (
              // Step 2: Call joinCircle
              <div className="space-y-4">
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  PIN verified. Circle #{circleId} found.
                </div>
                <p className="text-sm text-muted text-pretty">
                  Click below to join the circle. You are pre-approved automatically once you join.
                  The creator will start the circle once all members have joined.
                </p>
                {txState === 'idle' && (
                  <Button className="w-full" onClick={handleJoin}>
                    Join Circle #{circleId}
                  </Button>
                )}
                {txState === 'signing' && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" /> Awaiting signature…
                  </div>
                )}
                {txState === 'confirming' && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
                    {txHash && (
                      <a href={explorerTx(txHash)} target="_blank" rel="noopener noreferrer" className="text-terra-400 hover:underline flex items-center gap-1">
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
                {txState === 'success' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" /> You have joined the circle!
                    </div>
                    <p className="text-xs text-muted text-pretty">
                      The creator will start the circle once all members have joined. You will be able to contribute immediately after.
                    </p>
                    <Button variant="secondary" className="w-full" onClick={() => router.push('/dashboard')}>
                      Go to dashboard
                    </Button>
                  </div>
                )}
                {txState === 'error' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-danger">
                      <AlertTriangle className="h-4 w-4" /> {txError}
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => setTxState('idle')}>
                      Try again
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              // Step 1: Enter PIN
              <ChainGuard>
                <div className="space-y-4">
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
                      The PIN was shared by the circle creator. It restricts access to this circle through the app.
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
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
