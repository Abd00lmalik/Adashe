import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPublicClient, http, defineChain } from 'viem'
import { validateInviteToken } from '@/lib/invite'
import { checkPinRateLimit, recordPinAttempt, verifyPin } from '@/lib/pin'
import { db } from '@/lib/db'
import { getClientIp } from '@/lib/utils'
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib/contract'

const VerifySchema = z.object({
  token: z.string().min(1),
  pin: z.string().min(1).max(64),
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid wallet address'),
})

// Resolve the Arc Testnet RPC URL from the proxy env vars when available,
// otherwise fall back to the public endpoint stored in NEXT_PUBLIC_RPC_URL.
function getRpcUrl(): string {
  const proxyBase = process.env.RPC_PROXY_BASE_URL
  const proxyToken = process.env.RPC_PROXY_TOKEN
  const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map((s) => s.trim())
  if (proxyBase && proxyToken && proxyChains.includes('Arc_Testnet')) {
    return `${proxyBase}/api/rpc/Arc_Testnet?_rpc_token=${proxyToken}`
  }
  // Fall back to the public RPC URL configured at deploy time
  const publicRpc = process.env.NEXT_PUBLIC_RPC_URL
  if (!publicRpc) throw new Error('No RPC URL configured. Set NEXT_PUBLIC_RPC_URL or the RPC_PROXY_* variables.')
  return publicRpc
}

// Build a viem public client for Arc Testnet for on-chain eligibility checks.
function getPublicClient() {
  const rpcUrl = getRpcUrl()
  const arcTestnet = defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
  return createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) })
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  try {
    const body = await request.json()
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { token, pin, wallet } = parsed.data

    // Step 1: Validate the invite token (expiry, revocation)
    let invite
    try {
      invite = await validateInviteToken(token)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid invite' }, { status: 400 })
    }

    // Step 2: On-chain eligibility check — is this wallet assigned to a position?
    let isEligible = false
    try {
      const client = getPublicClient()
      isEligible = await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'isInPayoutOrder',
        args: [BigInt(invite.circleId), wallet as `0x${string}`],
      }) as boolean
    } catch (err) {
      console.error('Eligibility check error:', err)
      // Fail closed — cannot grant access if we cannot verify eligibility
      return NextResponse.json(
        { error: 'Could not verify wallet eligibility. Please try again.' },
        { status: 503 }
      )
    }

    if (!isEligible) {
      return NextResponse.json(
        { error: 'This wallet is not assigned to a position in this circle.' },
        { status: 403 }
      )
    }

    // Step 3: Rate limit PIN attempts per invite per IP
    const { allowed, attemptsRemaining } = await checkPinRateLimit(invite.id, ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many PIN attempts. Please wait 15 minutes before trying again.' },
        { status: 429 }
      )
    }

    // Step 4: Retrieve the server-side PIN hash for this (contract, circle) pair.
    // The composite key prevents circleId=1 on a redeployed contract from matching
    // the circleId=1 PIN record created under a previous deployment.
    const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '').toLowerCase()
    const circlePin = await db.circlePin.findUnique({
      where: { contractAddress_circleId: { contractAddress, circleId: invite.circleId } },
    })

    if (!circlePin) {
      // No PIN record found — fail closed. The creator's handleCreate stores it after tx confirmation.
      // If this triggers, the creator needs to recreate the circle or a migration is needed.
      console.warn(`No PIN record found for circle ${invite.circleId}`)
      return NextResponse.json(
        { error: 'Circle PIN is not yet configured. Ask the creator to check their dashboard.' },
        { status: 503 }
      )
    }

    // Step 5: Verify the PIN
    const pinOk = await verifyPin(pin, circlePin.pinHash)
    await recordPinAttempt(invite.id, ip, pinOk)

    if (!pinOk) {
      return NextResponse.json(
        { error: `Incorrect PIN. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.` },
        { status: 401 }
      )
    }

    return NextResponse.json({ circleId: invite.circleId, verified: true })
  } catch (err) {
    console.error('PIN verify error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
