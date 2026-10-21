'use client'

import { useState, useEffect } from 'react'
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { isAddress } from 'viem'
import { adasheContract, CONTRACT_ABI, CircleStatus } from '@/lib/contract'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { TxButton, type TxState } from '@/components/tx/TxButton'
import { AddressDisplay } from '@/components/ui/AddressDisplay'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Share2, UserCheck, UserX, UserPlus, Copy, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { sameAddress } from '@/lib/utils'
import { useAccount } from 'wagmi'

interface CreatorPanelProps {
  cid: bigint
  circleRaw: readonly unknown[]
}

export function CreatorPanel({ cid, circleRaw }: CreatorPanelProps) {
  const { address } = useAccount()
  const [copiedLink, setCopiedLink] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(true)
  const [approveTxStates, setApproveTxStates] = useState<Record<string, TxState>>({})
  const [removeTxStates, setRemoveTxStates] = useState<Record<string, TxState>>({})
  const [replaceTxState, setReplaceTxState] = useState<TxState>({ status: 'idle' })
  const [startTxState, setStartTxState] = useState<TxState>({ status: 'idle' })
  const [replaceOld, setReplaceOld] = useState('')
  const [replaceNew, setReplaceNew] = useState('')
  const [replaceReason, setReplaceReason] = useState('')

  const [, , , , memberCount, , , , , status] = circleRaw as [
    bigint, string, string, bigint, number, number, number, number, string, number, ...unknown[]
  ]

  const isPending = (status as unknown as number) === CircleStatus.PENDING

  const { data: payoutOrderData } = useReadContracts({
    contracts: [{ ...adasheContract, functionName: 'getPayoutOrder', args: [cid] }],
  })
  const payoutOrder = payoutOrderData?.[0]?.status === 'success'
    ? (payoutOrderData[0].result as string[])
    : []

  const memberRecordContracts = payoutOrder.map((addr) => ({
    ...adasheContract,
    functionName: 'memberRecords' as const,
    args: [cid, addr as `0x${string}`],
  }))

  const { data: memberData, isLoading, refetch } = useReadContracts({
    contracts: memberRecordContracts,
    query: { enabled: payoutOrder.length > 0 },
  })

  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()

  // Track the startCircle tx hash so we can wait for its receipt.
  const [startTxHash, setStartTxHash] = useState<`0x${string}` | undefined>()
  const { isSuccess: startReceiptSuccess, isError: startReceiptError } = useWaitForTransactionReceipt({
    hash: startTxHash,
    query: { enabled: !!startTxHash },
  })

  // Once the receipt confirms, invalidate cached circle data and show success.
  useEffect(() => {
    if (startReceiptSuccess && startTxHash) {
      setStartTxState({ status: 'success', hash: startTxHash })
      toast.success('Circle started!')
      // Invalidate all contract reads so the page re-fetches fresh status.
      queryClient.invalidateQueries()
      setStartTxHash(undefined)
    }
    if (startReceiptError && startTxHash) {
      setStartTxState({ status: 'error', message: 'Start transaction reverted.' })
      setStartTxHash(undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startReceiptSuccess, startReceiptError])

  // On mount: check if a valid invite already exists for this circle so the
  // link survives page refreshes without re-generating a duplicate.
  useEffect(() => {
    const loadExistingInvite = async () => {
      setInviteLoading(true)
      try {
        const res = await fetch(`/api/circles/${cid.toString()}/invite`)
        if (!res.ok) return
        const data = await res.json()
        // data is an array of invite objects; pick the first non-expired one
        if (Array.isArray(data) && data.length > 0) {
          const valid = data.find((inv: { link: string; expiresAt: string }) =>
            new Date(inv.expiresAt) > new Date()
          )
          if (valid?.link) setInviteLink(valid.link)
        }
      } catch {
        // Non-critical — the user can still generate a new link
      } finally {
        setInviteLoading(false)
      }
    }
    loadExistingInvite()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid.toString()])

  const generateInvite = async () => {
    if (!address) return
    setGeneratingInvite(true)
    try {
      const res = await fetch(`/api/circles/${cid.toString()}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorAddress: address }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data?.error ?? `Server error (${res.status}). Make sure DATABASE_URL and NEXT_PUBLIC_APP_URL are set.`
        toast.error(msg)
        return
      }
      if (!data.link) {
        toast.error('Server returned no invite link. Check NEXT_PUBLIC_APP_URL is configured.')
        return
      }
      setInviteLink(data.link)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      toast.error(`Failed to generate invite link: ${msg}`)
    } finally {
      setGeneratingInvite(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleApprove = async (memberAddr: string) => {
    setApproveTxStates((s) => ({ ...s, [memberAddr]: { status: 'signing' } }))
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'approveMember',
        args: [cid, memberAddr as `0x${string}`],
      })
      setApproveTxStates((s) => ({ ...s, [memberAddr]: { status: 'confirming', hash } }))
      // Wait ~4s for the tx to mine, then refetch and mark success.
      await new Promise((r) => setTimeout(r, 4000))
      await refetch()
      setApproveTxStates((s) => ({ ...s, [memberAddr]: { status: 'success', hash } }))
      toast.success(`Approved ${memberAddr.slice(0, 6)}…`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setApproveTxStates((s) => ({ ...s, [memberAddr]: { status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Approval failed.' } }))
    }
  }

  const handleRemove = async (memberAddr: string) => {
    setRemoveTxStates((s) => ({ ...s, [memberAddr]: { status: 'signing' } }))
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'removePendingMember',
        args: [cid, memberAddr as `0x${string}`],
      })
      setRemoveTxStates((s) => ({ ...s, [memberAddr]: { status: 'confirming', hash } }))
      await new Promise((r) => setTimeout(r, 4000))
      await refetch()
      setRemoveTxStates((s) => ({ ...s, [memberAddr]: { status: 'success', hash } }))
      toast.success(`Removed ${memberAddr.slice(0, 6)}...`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setRemoveTxStates((s) => ({ ...s, [memberAddr]: { status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Remove failed.' } }))
    }
  }

  const handleReplace = async () => {
    if (!isAddress(replaceOld) || !isAddress(replaceNew)) {
      toast.error('Enter valid Ethereum addresses')
      return
    }
    setReplaceTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'approveReplacement',
        args: [cid, replaceOld as `0x${string}`, replaceNew as `0x${string}`],
      })
      setReplaceTxState({ status: 'confirming', hash })
      await new Promise((r) => setTimeout(r, 4000))
      await refetch()
      setReplaceTxState({ status: 'success', hash })
      toast.success('Replacement approved')
      setReplaceOld('')
      setReplaceNew('')
      setReplaceReason('')
      await refetch()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setReplaceTxState({ status: 'error', message: msg.includes('User rejected') ? 'Rejected.' : 'Replace failed.' })
    }
  }

  const handleStartCircle = async () => {
    setStartTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: adasheContract.address,
        abi: CONTRACT_ABI as Parameters<typeof writeContractAsync>[0]['abi'],
        functionName: 'startCircle',
        args: [cid],
      })
      // Store hash — the useWaitForTransactionReceipt hook handles success/error.
      setStartTxHash(hash)
      setStartTxState({ status: 'confirming', hash })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setStartTxState({ status: 'error', message: msg.includes('not all approved') ? 'Not all members are approved yet.' : msg.includes('not all members joined') ? 'Not all members have joined yet.' : msg.includes('User rejected') ? 'Rejected.' : 'Failed to start circle.' })
    }
  }

  // Members who have NOT yet joined (joined=false, not removed)
  const pendingMembers = payoutOrder.filter((addr, i) => {
    const rec = memberData?.[i]?.status === 'success'
      ? (memberData[i].result as [boolean, boolean, bigint, bigint, bigint, string])
      : null
    if (!rec) return false
    const joined = rec[1] as boolean
    const removedAt = BigInt(rec[4] as bigint)
    return !joined && removedAt === 0n
  })

  // Members who have already joined
  const joinedCount = payoutOrder.filter((addr, i) => {
    const rec = memberData?.[i]?.status === 'success'
      ? (memberData[i].result as [boolean, boolean, bigint, bigint, bigint, string])
      : null
    return rec && (rec[1] as boolean)
  }).length

  return (
    <div className="space-y-4">
      {/* Invite link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-terra-400" />
            Invite Members
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted text-pretty">
            Generate an invite link to share with your members. 
            They&apos;ll need the circle PIN to proceed through the app.
          </p>
          {inviteLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invite…
            </div>
          ) : inviteLink ? (
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly className="font-mono text-xs min-w-0" />
              <Button variant="outline" size="icon" onClick={copyLink} className="shrink-0 min-w-[44px] min-h-[44px]">
                {copiedLink ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={generateInvite} disabled={generatingInvite}>
              {generatingInvite ? 'Generating…' : 'Generate Invite Link'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Members awaiting join */}
      {isPending && pendingMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-amber-500" />
              Awaiting Join ({joinedCount}/{memberCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted">
              These members have not joined yet. Share the invite link so they can join. Once a member joins they are automatically approved.
            </p>
            {pendingMembers.map((addr) => (
              <div key={addr} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 py-1">
                <AddressDisplay address={addr} chars={4} />
                <div className="flex gap-2 shrink-0">
                  <TxButton
                    txState={removeTxStates[addr] ?? { status: 'idle' }}
                    onAction={() => handleRemove(addr)}
                    idleLabel="Remove Slot"
                    size="sm"
                    variant="destructive"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Start circle */}
      {isPending && (
        <Card className={pendingMembers.length === 0 ? 'border-forest-300 bg-forest-50/50' : undefined}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {pendingMembers.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-forest-500">
                  <UserCheck className="h-4 w-4" />
                  Ready to Start
                </span>
              ) : 'Start Circle'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingMembers.length === 0 ? (
              <p className="text-sm text-forest-600 text-pretty">
                All {memberCount} members have joined. Start the circle to begin the first contribution period.
              </p>
            ) : (
              <p className="text-sm text-muted text-pretty">
                Waiting for {pendingMembers.length} more member{pendingMembers.length > 1 ? 's' : ''} to join ({joinedCount}/{memberCount} joined). Once all members have joined, you can start the circle.
              </p>
            )}
            <TxButton
              txState={startTxState}
              onAction={handleStartCircle}
              idleLabel="Start Circle"
              variant={pendingMembers.length === 0 ? 'default' : 'secondary'}
              disabled={pendingMembers.length > 0 || startTxState.status === 'confirming'}
            />
          </CardContent>
        </Card>
      )}

      {/* Replace member */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-forest-400" />
            Replace Member
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted text-pretty">
            Replace an existing member with a new wallet address. 
            The new member inherits the position but not any debt from the original.
          </p>
          <div className="space-y-2">
            <div>
              <Label>Current member address</Label>
              <Input
                value={replaceOld}
                onChange={(e) => setReplaceOld(e.target.value)}
                placeholder="0x… (existing member)"
                className="mt-1 font-mono text-xs sm:text-sm"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div>
              <Label>New member address</Label>
              <Input
                value={replaceNew}
                onChange={(e) => setReplaceNew(e.target.value)}
                placeholder="0x… (replacement)"
                className="mt-1 font-mono text-xs sm:text-sm"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)} placeholder="e.g. wallet compromised" className="mt-1" />
            </div>
          </div>
          <TxButton
            txState={replaceTxState}
            onAction={handleReplace}
            idleLabel="Replace Member"
            variant="outline"
          />
        </CardContent>
      </Card>
    </div>
  )
}
