import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateInviteToken } from '@/lib/invite'
import { checkPinRateLimit, recordPinAttempt, verifyPin } from '@/lib/pin'
import { db } from '@/lib/db'
import { getClientIp } from '@/lib/utils'

const VerifySchema = z.object({
  token: z.string().min(1),
  pin: z.string().min(1).max(64),
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid wallet address'),
})

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  try {
    const body = await request.json()
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { token, pin, wallet } = parsed.data

    // Validate the invite token (expiry, revocation)
    let invite
    try {
      invite = await validateInviteToken(token)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid invite' }, { status: 400 })
    }

    // Rate limit PIN attempts per invite per IP
    const { allowed, attemptsRemaining } = await checkPinRateLimit(invite.id, ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many PIN attempts. Please wait 15 minutes before trying again.' },
        { status: 429 }
      )
    }

    // Retrieve the server-side PIN hash for this circle
    const circlePin = await db.circlePin.findUnique({
      where: { circleId: invite.circleId },
    })

    if (!circlePin) {
      // Circle exists on-chain but no PIN was stored (edge case)
      await recordPinAttempt(invite.id, ip, true)
      return NextResponse.json({ circleId: invite.circleId, verified: true })
    }

    const pinOk = await verifyPin(pin, circlePin.pinHash)
    await recordPinAttempt(invite.id, ip, pinOk)

    if (!pinOk) {
      return NextResponse.json(
        { error: `Incorrect PIN. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.` },
        { status: 401 }
      )
    }

    return NextResponse.json({
      circleId: invite.circleId,
      verified: true,
    })
  } catch (err) {
    console.error('PIN verify error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
