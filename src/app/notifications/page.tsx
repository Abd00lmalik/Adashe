'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'
import {
  Bell, AlertTriangle, CheckCircle2, Clock, Shield,
  ArrowRightCircle, Users, Coins, Info, ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { NotificationType } from '@prisma/client'

interface AppNotification {
  id: string
  circleId: string
  type: NotificationType
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

function typeIcon(type: NotificationType) {
  switch (type) {
    case 'MISSED_PAYMENT':
    case 'DEBT_RECORDED':
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
    case 'PAYOUT_AVAILABLE':
      return <Coins className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
    case 'PAYOUT_WITHHELD':
      return <Shield className="h-4 w-4 text-terra-400 shrink-0 mt-0.5" />
    case 'PERIOD_FINALIZED':
    case 'CIRCLE_COMPLETED':
      return <CheckCircle2 className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
    case 'MEMBER_JOINED':
    case 'MEMBER_APPROVED':
      return <Users className="h-4 w-4 text-forest-400 shrink-0 mt-0.5" />
    case 'CIRCLE_ACTIVATED':
    case 'PERIOD_STARTED':
      return <ArrowRightCircle className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
    case 'CONTRIBUTION_DUE':
    case 'DEADLINE_APPROACHING':
    case 'GRACE_PERIOD_WARNING':
      return <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
    case 'MEMBER_REPLACED':
      return <Users className="h-4 w-4 text-terra-400 shrink-0 mt-0.5" />
    default:
      return <Info className="h-4 w-4 text-muted shrink-0 mt-0.5" />
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NotificationsPage() {
  const { address, isConnected } = useAccount()
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?wallet=${address}&all=true`)
      if (!res.ok) return
      const data = await res.json() as { notifications: AppNotification[] }
      setNotifications(data.notifications ?? [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => { void fetchAll() }, [fetchAll])

  const markAllRead = async () => {
    if (!address) return
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    try { await fetch(`/api/notifications?wallet=${address}`, { method: 'PATCH' }) } catch { /* silent */ }
  }

  const markOneRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
    try { await fetch(`/api/notifications/${id}?wallet=${address}`, { method: 'PATCH' }) } catch { /* silent */ }
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-ivory-DEFAULT flex flex-col items-center justify-center px-4 gap-4">
        <Bell className="h-10 w-10 text-ivory-400" />
        <p className="text-sm text-muted text-center">Connect your wallet to see notifications.</p>
        <button onClick={() => router.back()} className="text-sm text-forest-500 hover:underline">Go back</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ivory-DEFAULT">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-ivory-DEFAULT border-b border-ivory-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted hover:text-forest-500 hover:bg-forest-50 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="font-display font-semibold text-forest-500 text-base leading-tight">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <p className="text-xs text-muted">{unreadCount} unread</p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-forest-500 hover:underline font-medium px-3 py-2 rounded-lg hover:bg-forest-50 transition-colors min-h-[36px]"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 rounded-full border-2 border-forest-300 border-t-forest-500 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
            <Bell className="h-10 w-10 text-ivory-400" />
            <p className="font-medium text-forest-500">No notifications yet</p>
            <p className="text-sm text-muted text-pretty max-w-xs">
              You will be notified when members miss payments, payouts are ready, and more.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-ivory-100">
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={`/circles/${n.circleId}`}
                onClick={() => { if (!n.readAt) void markOneRead(n.id) }}
                className={cn(
                  'flex items-start gap-3 px-4 py-4 transition-colors',
                  !n.readAt ? 'bg-forest-50/60 hover:bg-forest-50' : 'hover:bg-ivory-100/60'
                )}
              >
                {/* Unread dot */}
                <div className="mt-1 shrink-0 w-2">
                  {!n.readAt && <span className="block h-2 w-2 rounded-full bg-terra-400" />}
                </div>

                {typeIcon(n.type)}

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm leading-snug text-pretty',
                    !n.readAt ? 'font-semibold text-forest-500' : 'font-medium text-forest-500/80'
                  )}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted text-pretty mt-0.5">{n.body}</p>
                  <p className="text-[11px] text-muted/70 mt-1 tabular-nums">{timeAgo(n.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
