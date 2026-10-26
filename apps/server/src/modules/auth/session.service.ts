import { refreshOutcomes } from './session.metrics.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DeviceMetadata } from '@repo/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuthenticationError } from '../../exceptions/index.js';
import prisma from '../../utils/context.js';
import { signAccessToken, ACCESS_TTL_SECONDS } from './access-token.js';

export const SLIDING_MS = 30 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
export const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newRefresh = () => randomBytes(32).toString('base64url');
export const sessionDeadline = (now: Date, absolute: Date) =>
  new Date(Math.min(now.getTime() + SLIDING_MS, absolute.getTime()));

export async function lockSessionUser(tx: Prisma.TransactionClient, userId: number) {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
}
export async function revokeUserSessions(
  tx: Prisma.TransactionClient,
  userId: number,
  reason: string,
) {
  await tx.deviceSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revocationReason: reason },
  });
}

export async function createDeviceSession(
  userId: number,
  device: DeviceMetadata,
  expectedPasswordHash: string,
) {
  const refreshToken = newRefresh();
  return prisma.$transaction(async (tx) => {
    await lockSessionUser(tx, userId);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { password: true, active: true, deletedAt: true },
    });
    if (!user?.active || user.deletedAt || user.password !== expectedPasswordHash)
      throw new AuthenticationError('Login failed');
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
    const family = await tx.deviceSession.create({
      data: {
        userId,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        absoluteExpiresAt,
        expiresAt: sessionDeadline(now, absoluteExpiresAt),
        generations: { create: { tokenHash: hashRefreshToken(refreshToken), generation: 0 } },
      },
    });
    // Signing inside the transaction avoids consuming credentials if keys are unavailable.
    return {
      accessToken: signAccessToken(userId, family.id),
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken,
      refreshExpiresAt: family.expiresAt,
    };
  });
}

export async function refreshDeviceSession(refreshToken: string, deviceId: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const existing = await prisma.sessionRefreshToken.findUnique({
    where: { tokenHash },
    include: { family: true },
  });
  if (!existing) {
    refreshOutcomes.inc({ outcome: 'invalid' });
    throw new AuthenticationError('Session expired or revoked');
  }
  let reused = false;
  const result = await prisma.$transaction(async (tx) => {
    await lockSessionUser(tx, existing.family.userId);
    await tx.$queryRaw`SELECT id FROM DeviceSession WHERE id = ${existing.familyId} FOR UPDATE`;
    const token = await tx.sessionRefreshToken.findUnique({
      where: { tokenHash },
      include: { family: { include: { user: { select: { active: true, deletedAt: true } } } } },
    });
    if (!token) return null;
    const family = token.family;
    const now = new Date();
    if (token.consumedAt) {
      reused = true;
      await tx.deviceSession.update({
        where: { id: family.id },
        data: { revokedAt: now, revocationReason: 'refresh_reuse' },
      });
      return null;
    }
    if (
      family.revokedAt ||
      family.deviceId !== deviceId ||
      family.expiresAt <= now ||
      family.absoluteExpiresAt <= now ||
      !family.user.active ||
      family.user.deletedAt
    )
      return null;
    const nextRefresh = newRefresh();
    const replacementId = randomUUID();
    const expiresAt = sessionDeadline(now, family.absoluteExpiresAt);
    const accessToken = signAccessToken(family.userId, family.id);
    await tx.sessionRefreshToken.update({
      where: { id: token.id },
      data: { consumedAt: now, replacementId },
    });
    await tx.sessionRefreshToken.create({
      data: {
        id: replacementId,
        familyId: family.id,
        tokenHash: hashRefreshToken(nextRefresh),
        generation: token.generation + 1,
      },
    });
    await tx.deviceSession.update({
      where: { id: family.id },
      data: { expiresAt, lastRefreshedAt: now },
    });
    return {
      accessToken,
      expiresIn: ACCESS_TTL_SECONDS,
      refreshToken: nextRefresh,
      refreshExpiresAt: expiresAt,
    };
  });
  // A replay must commit family revocation, rather than roll it back by throwing in the transaction.
  if (!result) {
    refreshOutcomes.inc({ outcome: reused ? 'reuse' : 'rejected' });
    throw new AuthenticationError('Session expired or revoked');
  }
  refreshOutcomes.inc({ outcome: 'success' });
  return result;
}

export async function logoutDeviceSession(refreshToken: string, deviceId: string) {
  const token = await prisma.sessionRefreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { family: true },
  });
  if (!token || token.family.deviceId !== deviceId) return;
  await prisma.$transaction(async (tx) => {
    await lockSessionUser(tx, token.family.userId);
    await tx.deviceSession.updateMany({
      where: { id: token.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'logout' },
    });
  });
}
export async function listDeviceSessions(userId: number) {
  return prisma.deviceSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastRefreshedAt: 'desc' },
  });
}
export async function revokeDevice(userId: number, deviceId: string) {
  await prisma.$transaction(async (tx) => {
    await lockSessionUser(tx, userId);
    await tx.deviceSession.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'device_revoked' },
    });
  });
  return true;
}
