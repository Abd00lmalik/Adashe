import type { SessionOptions } from 'iron-session'

export interface SessionData {
  wallet?: string // connected wallet address (lowercase)
  nonce?: string  // for SIWE if added later
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? 'fallback-dev-secret-replace-in-production',
  cookieName: 'adashe-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}

declare module 'iron-session' {
  interface IronSessionData extends SessionData {}
}

