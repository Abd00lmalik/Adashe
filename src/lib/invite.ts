/**
 * Server-side invite token management.
 * Tokens are random and unguessable; they carry no sensitive data.
 */
import { nanoid } from 'nanoid'
import { db } from './db'

const TOKEN_LENGTH = 32
const DEFAULT_EXPIRY_HOURS = 72 // 3 days

export interface InviteRecord {
  id: string
  token: string
  circleId: string
  createdBy: string
  expiresAt: Date
  revokedAt: Date | null
  usedAt: Date | null
  usedBy: string | null
}

/** Create a new invite token for a circle. */
export async function createInvite(
  circleId: string | bigint,
  creatorAddress: string,
  expiryHours = DEFAULT_EXPIRY_HOURS
): Promise<InviteRecord> {
  const token = nanoid(TOKEN_LENGTH)
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)

  return db.invite.create({
    data: {
      token,
      circleId: String(circleId),
      createdBy: creatorAddress.toLowerCase(),
      expiresAt,
    },
  })
}

/**
 * Validate an invite token.
 * Returns the invite record if valid; throws with a reason if not.
 */
export async function validateInviteToken(token: string): Promise<InviteRecord> {
  const invite = await db.invite.findUnique({ where: { token } })

  if (!invite) throw new Error('Invite not found.')
  if (invite.revokedAt) throw new Error('This invite link has been revoked.')
  if (invite.expiresAt < new Date()) throw new Error('This invite link has expired.')
  // Allow reuse of the same token for multiple members if creator wishes
  // (creator pre-populates all addresses in the payout order)

  return invite
}

/** Revoke an invite token. Only the creator of the circle should call this. */
export async function revokeInvite(
  token: string,
  requestingAddress: string
): Promise<void> {
  const invite = await db.invite.findUnique({ where: { token } })
  if (!invite) throw new Error('Invite not found.')
  if (invite.createdBy !== requestingAddress.toLowerCase())
    throw new Error('Only the creator can revoke invites.')
  if (invite.revokedAt) throw new Error('Already revoked.')

  await db.invite.update({
    where: { token },
    data: { revokedAt: new Date() },
  })
}

/** Mark an invite as used by a wallet. */
export async function markInviteUsed(token: string, wallet: string): Promise<void> {
  await db.invite.update({
    where: { token },
    data: { usedAt: new Date(), usedBy: wallet.toLowerCase() },
  })
}

/** Get all active invites for a circle. */
export async function getCircleInvites(circleId: string | bigint): Promise<InviteRecord[]> {
  return db.invite.findMany({
    where: {
      circleId: String(circleId),
      revokedAt: null,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })
}
