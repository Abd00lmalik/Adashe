import { NextRequest, NextResponse } from 'next/server'
import { getUnreadNotifications, markAllRead } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Missing or invalid wallet' }, { status: 400 })
  }
  try {
    const notifications = await getUnreadNotifications(wallet)
    return NextResponse.json({ notifications, count: notifications.length })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'Missing or invalid wallet' }, { status: 400 })
  }
  try {
    await markAllRead(wallet)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 })
  }
}
