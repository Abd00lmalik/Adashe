import { NextRequest, NextResponse } from 'next/server'
import { markNotificationRead } from '@/lib/notifications'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const wallet = request.nextUrl.searchParams.get('wallet')
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Missing or invalid wallet' }, { status: 400 })
  }
  if (!id) {
    return NextResponse.json({ error: 'Missing notification id' }, { status: 400 })
  }
  try {
    await markNotificationRead(id, wallet)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to mark notification read' }, { status: 500 })
  }
}
