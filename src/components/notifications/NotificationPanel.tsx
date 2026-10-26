'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { Bell, X, AlertTriangle, CheckCircle2, Clock, Shield, ArrowRightCircle, Users, Coins, Info } from 'lucide-react'
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
      return <ArrowRightCircle className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
    case 'CONTRIBUTION_DUE':
    case 'DEADLINE_APPROACHING':
    case 'GRACE_PERIOD_WARNING':
      return <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
    case 'PERIOD_STARTED':
      return <ArrowRightCircle className="h-4 w-4 text-forest-500 shrink-0 mt-0.5" />
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
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function NotificationBell() {
  const { address, isConnected } = useAccount()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const unreadCount = notifications.filter((n) => !n.readAt).length

  const fetchNotifications = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?wallet=${address}&all=true`)
      if (!res.ok) return
      const data = await res.json() as { notifications: AppNotification[] }
      setNotifications(data.notifications ?? [])
    } catch {
      // silently fail — notifications are non-critical
    } finally {
      setLoading(false)
    }
  }, [address])

  // Fetch on open and poll every 30s while open
  useEffect(() => {
    if (!open || !address) return
    void fetchNotifications()
    const interval = setInterval(() => { void fetchNotifications() }, 30_000)
    return () => clearInterval(interval)
  }, [open, address, fetchNotifications])

  // Also fetch count in background every 60s when not open (for badge)
  useEffect(() => {
    if (!address || open) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications?wallet=${address}`)
        if (!res.ok) return
        const data = await res.json() as { notifications: AppNotification[] }
        setNotifications((prev) => {
          // Merge: keep read ones we already have, add new unread
          const existingIds = new Set(prev.map((n) => n.id))
          const fresh = (data.notifications ?? []).filter((n: AppNotification) => !existingIds.has(n.id))
          return [...fresh, ...prev]
        })
      } catch { /* silent */ }
    }
    void poll()
    const interval = setInterval(poll, 60_000)
    return () => clearInterval(interval)
  }, [address, open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const markAllRead = async () => {
    if (!address) return
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    try {
      await fetch(`/api/notifications?wallet=${address}`, { method: 'PATCH' })
    } catch { /* silent */ }
  }

  const markOneRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
    try {
      await fetch(`/api/notifications/${id}?wallet=${address}`, { method: 'PATCH' })
    } catch { /* silent */ }
  }

  if (!isConnected) return null

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative inline-flex items-center justify-center h-11 w-11 rounded-lg transition-colors',
          open
            ? 'bg-forest-100 text-forest-500'
            : 'text-muted hover:text-forest-500 hover:bg-forest-50'
        )}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-terra-400 text-white text-[9px] font-bold flex items-center justify-center tabular-nums leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-ivory-300 bg-ivory-DEFAULT shadow-float z-50 overflow-hidden"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ivory-200">
            <span className="font-display font-semibold text-sm text-forest-500">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-terra-400/15 text-terra-400 text-xs font-bold tabular-nums">
                  {unreadCount}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-muted hover:text-forest-500 transition-colors px-2 py-1 rounded-md hover:bg-forest-50 min-h-[32px]"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted hover:text-forest-500 hover:bg-forest-50 transition-colors"
                aria-label="Close notifications"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto overscroll-contain divide-y divide-ivory-100">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 rounded-full border-2 border-forest-300 border-t-forest-500 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                <Bell className="h-8 w-8 text-ivory-400" />
                <p className="text-sm font-medium text-forest-500">No notifications yet</p>
                <p className="text-xs text-muted text-pretty">
                  You will be notified when members miss payments, payouts are ready, and more.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onRead={markOneRead}
                  onClose={() => setOpen(false)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-ivory-200 px-4 py-2.5 text-center">
              <Link
                href="/notifications"
                className="text-xs text-forest-500 hover:underline font-medium"
                onClick={() => setOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationRow({
  notification: n,
  onRead,
  onClose,
}: {
  notification: AppNotification
  onRead: (id: string) => void
  onClose: () => void
}) {
  const isUnread = !n.readAt

  const handleClick = () => {
    if (isUnread) onRead(n.id)
    onClose()
  }

  return (
    <Link
      href={`/circles/${n.circleId}`}
      onClick={handleClick}
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors min-h-[60px]',
        isUnread
          ? 'bg-forest-50/60 hover:bg-forest-50'
          : 'hover:bg-ivory-100/60'
      )}
    >
      {/* Unread dot */}
      <div className="mt-1 shrink-0 w-2">
        {isUnread && (
          <span className="block h-2 w-2 rounded-full bg-terra-400" />
        )}
      </div>

      {typeIcon(n.type)}

      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm leading-snug text-pretty',
          isUnread ? 'font-semibold text-forest-500' : 'font-medium text-forest-500/80'
        )}>
          {n.title}
        </p>
        <p className="text-xs text-muted text-pretty mt-0.5 line-clamp-2">{n.body}</p>
        <p className="text-[11px] text-muted/70 mt-1 tabular-nums">{timeAgo(n.createdAt)}</p>
      </div>
    </Link>
  )
}
