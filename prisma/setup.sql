-- Adashe Onchain — Supabase schema setup
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: CREATE TABLE / INDEX statements use IF NOT EXISTS.
-- The CirclePin block uses DROP + CREATE to apply the composite-key migration.

-- 1. NotificationType enum
-- NOTE: Supabase does not support "CREATE TYPE IF NOT EXISTS".
-- If this type already exists you will get an error — just skip this block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'CIRCLE_ACTIVATED',
      'CONTRIBUTION_DUE',
      'DEADLINE_APPROACHING',
      'MISSED_PAYMENT',
      'PERIOD_FINALIZED',
      'PAYOUT_AVAILABLE',
      'PAYOUT_WITHHELD',
      'DEBT_RECORDED',
      'EXTENSION_REQUESTED',
      'EXTENSION_APPROVED',
      'REPLACEMENT_NEEDED',
      'MEMBER_APPROVED',
      'MEMBER_JOINED',
      'CIRCLE_COMPLETED'
    );
  END IF;
END$$;

-- 2. Invite
CREATE TABLE IF NOT EXISTS "Invite" (
  "id"        TEXT        NOT NULL PRIMARY KEY,
  "token"     TEXT        NOT NULL UNIQUE,
  "circleId"  TEXT        NOT NULL,
  "createdBy" TEXT        NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "usedAt"    TIMESTAMPTZ,
  "usedBy"    TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PinAttempt
CREATE TABLE IF NOT EXISTS "PinAttempt" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "inviteId"    TEXT        NOT NULL REFERENCES "Invite"("id") ON DELETE CASCADE,
  "ipAddress"   TEXT        NOT NULL,
  "attemptedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "succeeded"   BOOLEAN     NOT NULL DEFAULT FALSE
);

-- 4. CirclePin — composite primary key (contractAddress, circleId)
-- This prevents circleId=1 on a redeployed contract from colliding with
-- circleId=1 on a previous deployment (both counters start at 1 after deploy).
-- MIGRATION: drop the old single-key table and recreate with composite key.
-- WARNING: this clears any existing CirclePin records. Those records were
-- scoped to the wrong key anyway, so PINs will need to be re-stored by
-- recreating each circle or by a manual INSERT with the correct contractAddress.
DROP TABLE IF EXISTS "CirclePin";
CREATE TABLE "CirclePin" (
  "contractAddress" TEXT        NOT NULL,
  "circleId"        TEXT        NOT NULL,
  "pinHash"         TEXT        NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("contractAddress", "circleId")
);
CREATE INDEX IF NOT EXISTS "CirclePin_addr_circle_idx" ON "CirclePin"("contractAddress", "circleId");

-- 5. Notification
CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT               NOT NULL PRIMARY KEY,
  "circleId"  TEXT               NOT NULL,
  "wallet"    TEXT               NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "title"     TEXT               NOT NULL,
  "body"      TEXT               NOT NULL,
  "readAt"    TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS "Invite_circleId_idx"        ON "Invite"("circleId");
CREATE INDEX IF NOT EXISTS "Invite_token_idx"           ON "Invite"("token");
CREATE INDEX IF NOT EXISTS "PinAttempt_inviteId_ip_idx" ON "PinAttempt"("inviteId", "ipAddress");
CREATE INDEX IF NOT EXISTS "PinAttempt_ip_time_idx"     ON "PinAttempt"("ipAddress", "attemptedAt");
CREATE INDEX IF NOT EXISTS "Notification_wallet_idx"    ON "Notification"("wallet", "readAt");
CREATE INDEX IF NOT EXISTS "Notification_circle_idx"    ON "Notification"("circleId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Enum migrations — safe to run against an existing database at any time.
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MISSED_PAYMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GRACE_PERIOD_WARNING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PERIOD_STARTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEMBER_REPLACED';
