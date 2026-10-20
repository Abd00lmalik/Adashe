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
    const isDev = process.env.NODE_ENV === 'development'
    const detail = err instanceof Error ? err.message : String(err)
    // Surface the real error in development so the creator can diagnose DB connectivity issues.
    // In production, return a meaningful but non-sensitive message.
    const message = isDev
      ? `Invite creation failed: ${detail}`
      : detail.toLowerCase().includes('connect') || detail.toLowerCase().includes('prisma') || detail.toLowerCase().includes('database')
        ? 'Could not reach the database. Check that DATABASE_URL is set correctly in your environment variables.'
        : 'Invite creation failed. Check server logs for details.'
    return NextResponse.json({ error: message }, { status: 500 })
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
  } catch (err) {
    console.error('Fetch invites error:', err)
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }
}
