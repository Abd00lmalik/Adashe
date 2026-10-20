import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPin } from '@/lib/pin'

const StorePinSchema = z.object({
  pin: z.string().min(4).max(64),
})

/**
 * POST /api/circles/[circleId]/pin
 * Store a bcrypt hash of the circle PIN after circle creation.
 * Called server-side by the frontend after the CircleCreated tx is confirmed.
 * Idempotent: if a PIN already exists for this circle, it is NOT overwritten
 * (prevents any race or replay that could change the PIN after creation).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { circleId: string } }
) {
  try {
    const body = await request.json()
    const parsed = StorePinSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { pin } = parsed.data
    const { circleId } = params

    if (!circleId || isNaN(Number(circleId))) {
      return NextResponse.json({ error: 'Invalid circleId' }, { status: 400 })
    }

    // Check if a PIN is already stored for this circle — never overwrite
    const existing = await db.circlePin.findUnique({ where: { circleId } })
    if (existing) {
      return NextResponse.json({ stored: false, reason: 'PIN already set' })
    }

    const pinHash = await hashPin(pin)
    await db.circlePin.create({ data: { circleId, pinHash } })

    return NextResponse.json({ stored: true })
  } catch (err) {
    console.error('Store PIN error:', err)
    const isDev = process.env.NODE_ENV === 'development'
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: isDev ? `PIN storage failed: ${detail}` : 'Could not store PIN. Check server logs.' },
      { status: 500 }
    )
  }
}
