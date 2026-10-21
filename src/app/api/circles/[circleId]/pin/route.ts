import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPin } from '@/lib/pin'

const StorePinSchema = z.object({
  pin: z.string().min(4).max(64),
})

/**
 * The active contract address, lowercased.
 * Used as part of the composite primary key (contractAddress, circleId)
 * so that the same circleId on two different contract deployments never collide.
 * Both POST and verify routes must use the same value.
 */
function getContractAddress(): string {
  const addr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? ''
  if (!addr) console.warn('NEXT_PUBLIC_CONTRACT_ADDRESS is not set — PIN records will be keyed to empty string')
  return addr.toLowerCase()
}

/**
 * POST /api/circles/[circleId]/pin
 * Store a bcrypt hash of the circle PIN after circle creation.
 * Called by the frontend after the CircleCreated tx is confirmed.
 * Idempotent per (contractAddress, circleId) pair: a PIN already set for THIS
 * contract + circleId is not overwritten. A same circleId on a different
 * contract deployment is stored separately.
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
    const contractAddress = getContractAddress()

    if (!circleId || isNaN(Number(circleId))) {
      return NextResponse.json({ error: 'Invalid circleId' }, { status: 400 })
    }

    // Check if a PIN is already stored for this (contract, circle) pair — never overwrite.
    const existing = await db.circlePin.findUnique({
      where: { contractAddress_circleId: { contractAddress, circleId } },
    })
    if (existing) {
      return NextResponse.json({ stored: false, reason: 'PIN already set' })
    }

    const pinHash = await hashPin(pin)
    await db.circlePin.create({ data: { contractAddress, circleId, pinHash } })

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
