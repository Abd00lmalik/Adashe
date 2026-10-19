import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createInvite, getCircleInvites, validateInviteToken } from '@/lib/invite'
import { getClientIp } from '@/lib/utils'

const CreateSchema = z.object({
  creatorAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid address'),
  expiryHours: z.number().min(1).max(720).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { circleId: string } }
) {
  try {
    const body = await request.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const invite = await createInvite(
      params.circleId,
      parsed.data.creatorAddress,
      parsed.data.expiryHours
    )

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    return NextResponse.json({
      token: invite.token,
      link: `${appUrl}/join/${invite.token}`,
      expiresAt: invite.expiresAt.toISOString(),
    })
  } catch (err) {
    console.error('Create invite error:', err)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { circleId: string } }
) {
  try {
    const invites = await getCircleInvites(params.circleId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    return NextResponse.json(
      invites.map((inv) => ({
        id: inv.id,
        link: `${appUrl}/join/${inv.token}`,
        expiresAt: inv.expiresAt.toISOString(),
        usedBy: inv.usedBy,
      }))
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }
}
