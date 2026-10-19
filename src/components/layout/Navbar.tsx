'use client'

import { ConnectKitButton } from 'connectkit'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Plus, Menu, X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export function Navbar() {
  const pathname = usePathname()
  const { isConnected } = useAccount()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ivory-300/70 bg-ivory-DEFAULT/95 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-2">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group shrink-0">
              <span className="h-8 w-8 rounded-lg bg-forest-500 flex items-center justify-center text-white font-display font-bold text-sm">
                A
              </span>
              <span className="font-display font-semibold text-forest-500 text-base tracking-tight hidden sm:block">
                Adashe
              </span>
            </Link>

            {/* Desktop nav links */}
            {isConnected && (
              <nav className="hidden sm:flex items-center gap-1 flex-1 ml-4">
                <Link
                  href="/dashboard"
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] flex items-center',
                    pathname?.startsWith('/dashboard')
                      ? 'bg-forest-100 text-forest-500'
                      : 'text-muted hover:text-forest-500 hover:bg-forest-50'
                  )}
                >
                  My Circles
                </Link>
              </nav>
            )}

            {/* Right actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {isConnected && (
                <>
                  {/* New Circle — icon only on mobile, text on sm+ */}
                  <Link
                    href="/circles/new"
                    className="inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-2 sm:px-3 rounded-lg text-sm font-medium bg-terra-400/10 text-terra-400 hover:bg-terra-400/20 transition-colors justify-center"
                    aria-label="Create a circle"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">New Circle</span>
                  </Link>
                  <NotificationBell />
                </>
              )}

              {/* ConnectKit — shrink wrapper prevents overflow */}
              <div className="shrink-0">
                <ConnectKitButton />
              </div>

              {/* Mobile hamburger — only shown when connected */}
              {isConnected && (
                <button
                  className="sm:hidden inline-flex items-center justify-center h-11 w-11 rounded-lg text-forest-500 hover:bg-forest-50 transition-colors"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={menuOpen}
                >
                  {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile slide-down menu */}
      {menuOpen && isConnected && (
        <div
          className="fixed inset-0 z-30 sm:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute top-[calc(56px+env(safe-area-inset-top))] left-0 right-0 bg-ivory-DEFAULT border-b border-ivory-300 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="flex flex-col px-4 py-3 gap-1">
              <Link
                href="/dashboard"
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors min-h-[52px]',
                  pathname?.startsWith('/dashboard')
                    ? 'bg-forest-100 text-forest-500'
                    : 'text-forest-500 hover:bg-forest-50'
                )}
              >
                My Circles
              </Link>
              <Link
                href="/circles/new"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-terra-400 hover:bg-terra-50 transition-colors min-h-[52px]"
              >
                <Plus className="h-4 w-4" />
                Create New Circle
              </Link>
            </nav>
            <div className="px-4 pb-4 pt-1 border-t border-ivory-200" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <p className="text-xs text-muted mb-2">Connected wallet</p>
              <ConnectKitButton />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NotificationBell() {
  return (
    <button
      className="relative inline-flex items-center justify-center h-11 w-11 rounded-lg text-muted hover:text-forest-500 hover:bg-forest-50 transition-colors"
      aria-label="Notifications"
    >
      <Bell className="h-4 w-4" />
    </button>
  )
}
