/**
 * Server-side PIN utilities.
 * PIN is app-level access control only — never wallet authorization.
 * NEVER store plaintext PINs. NEVER log or return PIN values.
 * NEVER send PIN in responses.
 */
import bcrypt from 'bcryptjs'
import { db } from './db'

const BCRYPT_ROUNDS = 12
const MAX_ATTEMPTS_PER_WINDOW = 5
const WINDOW_MINUTES = 15

/** Hash a PIN for storage. Call server-side only. */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS)
}

/** Verify a PIN against a stored hash. Returns true/false. */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}

/**
 * Check rate limit for PIN attempts on a given invite from a given IP.
 * Returns true if the request is allowed, false if rate-limited.
 * Records the attempt.
 */
export async function checkPinRateLimit(
  inviteId: string,
  ipAddress: string
): Promise<{ allowed: boolean; attemptsRemaining: number }> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000)

  const recentAttempts = await db.pinAttempt.count({
    where: {
      inviteId,
      ipAddress,
      attemptedAt: { gte: windowStart },
      succeeded: false,
    },
  })

  const allowed = recentAttempts < MAX_ATTEMPTS_PER_WINDOW
  const attemptsRemaining = Math.max(0, MAX_ATTEMPTS_PER_WINDOW - recentAttempts - 1)

  return { allowed, attemptsRemaining }
}

/** Record a PIN attempt outcome. */
export async function recordPinAttempt(
  inviteId: string,
  ipAddress: string,
  succeeded: boolean
): Promise<void> {
  await db.pinAttempt.create({
    data: { inviteId, ipAddress, succeeded },
  })
}
