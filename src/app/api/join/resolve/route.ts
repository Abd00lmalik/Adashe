import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateInviteToken } from '@/lib/invite'

const ResolveSchema = z.object({
  token: z.string().min(1),
})

/**
 * POST /api/join/resolve
 * Resolve an invite token to its circleId without requiring a wallet.
 * Used by the JoinPage to determine which circle the invite belongs to
 * so it can perform an on-chain eligibility check before asking for the PIN.
 * Returns only the circleId — no other circle data is exposed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = ResolveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { token } = parsed.data

    let invite
    try {
      invite = await validateInviteToken(token)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid or expired invitation link.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ circleId: invite.circleId })
  } catch (err) {
    console.error('Resolve invite error:', err)
    return NextResponse.json({ error: 'Could not resolve invitation.' }, { status: 500 })
  }
}
