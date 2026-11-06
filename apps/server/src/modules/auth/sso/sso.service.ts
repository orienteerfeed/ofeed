import { randomBytes } from 'node:crypto';

import type { DeviceMetadata } from '@repo/shared';
import argon2 from 'argon2';

import type { IdentityProvider } from '../../../generated/prisma/client.js';
import env from '../../../config/env.js';
import { logger } from '../../../lib/logging.js';
import prisma from '../../../utils/context.js';
import { sendEmail } from '../../../utils/email.js';
import { createDeviceSession } from '../session.service.js';

import type { SsoProfile } from './providers.js';
import { SsoError } from './sso.errors.js';
import type { SsoState } from './sso.state.js';

const PROVIDER_LABELS: Record<IdentityProvider, string> = {
  ORIS: 'ORIS',
  GOOGLE: 'Google',
  GITHUB: 'GitHub',
};

function sendLinkedNotice(email: string, provider: IdentityProvider) {
  const label = PROVIDER_LABELS[provider];
  const profileUrl = `${env.CLIENT_APP_URL}/profile`;
  sendEmail({
    html: `<p>Your OFeed account was linked with ${label} sign-in.</p><p>If this was not you, unlink it in your <a href="${profileUrl}">profile</a> and reset your password.</p>`,
    text: `Your OFeed account was linked with ${label} sign-in. If this was not you, unlink it in your profile (${profileUrl}) and reset your password.`,
    subject: `OFeed - ${label} sign-in linked`,
    emailTo: email,
    onSuccess: () => logger.info('SSO link notice sent', { action: 'sso-link-notice' }),
    onError: (error) =>
      logger.error('Failed to send SSO link notice', {
        action: 'sso-link-notice',
        error: error instanceof Error ? error.message : String(error),
      }),
  });
}

/** Resolves the ofeed user for an external identity, creating or linking it as needed. */
export async function resolveSsoUser(
  provider: IdentityProvider,
  profile: SsoProfile,
  state: Pick<SsoState, 'mode' | 'userId'>,
): Promise<number> {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: { provider, providerUserId: profile.providerUserId },
    },
    select: { id: true, userId: true },
  });
  const email = profile.email?.trim() || undefined;

  if (state.mode === 'link') {
    if (!state.userId) throw new SsoError('invalid_state');
    if (identity && identity.userId !== state.userId) throw new SsoError('identity_taken');
    // The unique (userId, provider) index rejects linking a second account of the same provider.
    await prisma.userIdentity.upsert({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
      create: {
        userId: state.userId,
        provider,
        providerUserId: profile.providerUserId,
        email,
      },
      update: { email },
    });
    return state.userId;
  }

  if (identity) {
    await prisma.userIdentity.update({
      where: { id: identity.id },
      data: { lastLoginAt: new Date(), email },
    });
    return identity.userId;
  }

  if (!email) throw new SsoError('email_required');

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, active: true, deletedAt: true, emailVerifiedAt: true },
  });

  if (existing) {
    // Auto-link only when both sides proved ownership of the email; otherwise anyone able to
    // register that email at the provider could take over the ofeed account.
    if (
      !profile.emailVerified ||
      !existing.emailVerifiedAt ||
      !existing.active ||
      existing.deletedAt
    ) {
      throw new SsoError('email_in_use');
    }
    await prisma.userIdentity.create({
      data: {
        userId: existing.id,
        provider,
        providerUserId: profile.providerUserId,
        email,
        lastLoginAt: new Date(),
      },
    });
    sendLinkedNotice(existing.email, provider);
    return existing.id;
  }

  // Nobody knows this password; the user can set a real one through password reset.
  const unusablePassword = await argon2.hash(randomBytes(32));
  const user = await prisma.user.create({
    data: {
      email,
      firstname: profile.firstname?.trim() || '-',
      lastname: profile.lastname?.trim() || '-',
      password: unusablePassword,
      passwordSet: false,
      active: true,
      identities: {
        create: {
          provider,
          providerUserId: profile.providerUserId,
          email,
          lastLoginAt: new Date(),
        },
      },
    },
    select: { id: true },
  });
  return user.id;
}

export async function createSsoSession(userId: number, device: DeviceMetadata) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, active: true, deletedAt: true },
  });
  if (!user?.active || user.deletedAt) throw new SsoError('account_inactive');
  return createDeviceSession(userId, device, user.password);
}

export async function listUserIdentities(userId: number) {
  return prisma.userIdentity.findMany({
    where: { userId },
    select: { provider: true, email: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function unlinkUserIdentity(userId: number, provider: IdentityProvider) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { passwordSet: true, _count: { select: { identities: true } } },
    });
    if (user && !user.passwordSet && user._count.identities <= 1) {
      throw new SsoError('last_sign_in_method');
    }
    await tx.userIdentity.deleteMany({ where: { userId, provider } });
  });
}
