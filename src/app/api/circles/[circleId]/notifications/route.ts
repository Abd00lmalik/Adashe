import { NextRequest, NextResponse } from 'next/server'
import { getAllNotifications, markNotificationRead } from '@/lib/notifications'

export async function GET(
  request: NextRequest,
  { params }: { params: { circleId: string } }
) {
  const wallet = request.nextUrl.searchParams.get('wallet')
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Missing or invalid wallet' }, { status: 400 })
  }
  try {
    const notifications = await getAllNotifications(wallet, params.circleId)
    return NextResponse.json({ notifications })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
