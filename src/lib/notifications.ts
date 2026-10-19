import { db } from './db'
import type { NotificationType } from '@prisma/client'

export type { NotificationType }

export interface CreateNotificationInput {
  circleId: string | bigint
  wallet: string
  type: NotificationType
  title: string
  body: string
}

export async function createNotification(input: CreateNotificationInput) {
  return db.notification.create({
    data: {
      circleId: String(input.circleId),
      wallet: input.wallet.toLowerCase(),
      type: input.type,
      title: input.title,
      body: input.body,
    },
  })
}

export async function getUnreadNotifications(wallet: string) {
  return db.notification.findMany({
    where: {
      wallet: wallet.toLowerCase(),
      readAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function getAllNotifications(wallet: string, circleId?: string) {
  return db.notification.findMany({
    where: {
      wallet: wallet.toLowerCase(),
      ...(circleId ? { circleId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function markNotificationRead(id: string, wallet: string) {
  // Only the target wallet can mark its own notifications
  return db.notification.updateMany({
    where: { id, wallet: wallet.toLowerCase() },
    data: { readAt: new Date() },
  })
}

export async function markAllRead(wallet: string) {
  return db.notification.updateMany({
    where: { wallet: wallet.toLowerCase(), readAt: null },
    data: { readAt: new Date() },
  })
}
