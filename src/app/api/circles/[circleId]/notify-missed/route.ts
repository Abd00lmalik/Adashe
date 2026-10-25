import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createNotification } from '@/lib/notifications'

const Schema = z.object({
  creatorWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid creator address'),
  memberWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid member address'),
  periodIndex: z.number().int().min(0),
  amountDue: z.string(), // USDC amount as decimal string (e.g. "10.00")
  deadlineIso: z.string(), // ISO-8601 of original contribution deadline
  graceExpiryIso: z.string(), // ISO-8601 of grace period expiry
  circleName: z.string().max(100).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { circleId: string } }
) {
  try {
    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const {
      creatorWallet,
      memberWallet,
      periodIndex,
      amountDue,
      deadlineIso,
      graceExpiryIso,
      circleName,
    } = parsed.data

    const circleId = params.circleId

    // Deduplication: one notification per (circleId, memberWallet, periodIndex) combination.
    // If a notification already exists for this exact event, skip silently so retries are safe.
    const dedupKey = `missed:${circleId}:${memberWallet.toLowerCase()}:${periodIndex}`
    const existing = await db.notification.findFirst({
      where: {
        circleId,
        wallet: creatorWallet.toLowerCase(),
        type: 'MISSED_PAYMENT',
        body: { contains: dedupKey },
      },
    })

    if (existing) {
      return NextResponse.json({ ok: true, deduplicated: true })
    }

    const circleLabel = circleName ? `"${circleName}"` : `Circle ${circleId}`
    const memberShort = `${memberWallet.slice(0, 6)}...${memberWallet.slice(-4)}`

    await createNotification({
      circleId,
      wallet: creatorWallet,
      type: 'MISSED_PAYMENT',
      title: `Missed payment in ${circleLabel}`,
      body: [
        `Member ${memberShort} did not contribute for Period ${periodIndex + 1}.`,
        `Amount due: ${amountDue} USDC.`,
        `Original deadline: ${deadlineIso}.`,
        `Grace period expired: ${graceExpiryIso}.`,
        `[${dedupKey}]`,
      ].join(' '),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('notify-missed error:', err)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}
