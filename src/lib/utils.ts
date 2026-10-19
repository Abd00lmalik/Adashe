import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format, isPast } from 'date-fns'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Truncate an Ethereum address for display. */
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

/** Format a Unix timestamp (seconds) as a relative time string. */
export function timeAgo(unixSeconds: number | bigint): string {
  const ms = Number(unixSeconds) * 1000
  return formatDistanceToNow(new Date(ms), { addSuffix: true })
}

/** Format a Unix timestamp (seconds) as an absolute date/time string. */
export function formatDeadline(unixSeconds: number | bigint): string {
  const ms = Number(unixSeconds) * 1000
  return format(new Date(ms), 'dd MMM yyyy, HH:mm UTC')
}

/** Return true if a Unix timestamp (seconds) is in the past. */
export function isExpired(unixSeconds: number | bigint): boolean {
  return isPast(new Date(Number(unixSeconds) * 1000))
}

/** Seconds remaining until a Unix timestamp. Negative if past. */
export function secondsUntil(unixSeconds: number | bigint): number {
  return Math.floor(Number(unixSeconds) - Date.now() / 1000)
}

/** Format a duration in seconds as a human-readable countdown string. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Expired'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Normalize a wallet address to lowercase. */
export function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

/** Check if two addresses are the same (case-insensitive). */
export function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

/** Get an IP address from a Next.js request (handles Vercel forwarding). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}
