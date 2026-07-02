import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError } from '../../../exceptions/index.js';

const authServiceMock = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  sendVerificationEmailHelper: vi.fn(),
  authenticateUser: vi.fn(),
  changeAuthenticatedUserPassword: vi.fn(),
  passwordResetConfirm: vi.fn(),
  passwordResetRequest: vi.fn(),
  signupUser: vi.fn(),
}));

const eventServiceMock = vi.hoisted(() => ({
  deleteAllEventData: vi.fn(),
}));

vi.mock('../../auth/auth.service.js', () => authServiceMock);
vi.mock('../../event/event.service.js', () => eventServiceMock);
vi.mock('../../../utils/jwtToken.js', () => ({
  generateJwtTokenForLink: vi.fn(() => 'verification-token'),
}));

import { anonymizeCurrentUserAccount, signIn, updateAuthenticatedUser } from '../user.service.js';

describe('user GraphQL service signIn', () => {
  beforeEach(() => {
    Object.values(authServiceMock).forEach((mock) => mock.mockReset());
  });

  it('returns a user-friendly auth error when credentials do not match', async () => {
    authServiceMock.authenticateUser.mockRejectedValue(new AuthenticationError('Login failed'));

    await expect(
      signIn({
        username: 'missing@example.com',
        password: 'secret',
      }),
    ).rejects.toMatchObject({
      message: 'Invalid email or password',
      extensions: {
        code: 'UNAUTHENTICATED',
      },
    });
  });

  it('preserves more specific authentication messages', async () => {
    authServiceMock.authenticateUser.mockRejectedValue(
      new AuthenticationError('User account is not activated'),
    );

    await expect(
      signIn({
        username: 'inactive@example.com',
        password: 'secret',
      }),
    ).rejects.toMatchObject({
      message: 'User account is not activated',
      extensions: {
        code: 'UNAUTHENTICATED',
      },
    });
  });
});

describe('user GraphQL service updateAuthenticatedUser', () => {
  const auth = { isAuthenticated: true, userId: 42 } as const;

  beforeEach(() => {
    Object.values(authServiceMock).forEach((mock) => mock.mockReset());
  });

  it('clears email verification and sends a verification email when email changes', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'old@example.test' }),
        update: vi.fn().mockResolvedValue({
          id: 42,
          firstname: 'Ada',
          lastname: 'Lovelace',
          email: 'new@example.test',
          organisation: null,
          emergencyContact: null,
          emailVerifiedAt: null,
        }),
      },
    };

    const result = await updateAuthenticatedUser(db as never, auth, {
      email: ' New@Example.Test ',
      firstname: 'Ada',
      lastname: 'Lovelace',
    });

    expect(result.emailVerifiedAt).toBeNull();
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        email: 'new@example.test',
        emailVerifiedAt: null,
        firstname: 'Ada',
        lastname: 'Lovelace',
      },
    });
    expect(authServiceMock.sendVerificationEmailHelper).toHaveBeenCalledWith(
      'Ada',
      'Lovelace',
      'new@example.test',
      'http://localhost:3000/auth/verify-email/verification-token',
    );
  });

  it('keeps email verification untouched when email is unchanged after normalization', async () => {
    const verifiedAt = new Date('2026-05-28T10:00:00.000Z');
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'user@example.test' }),
        update: vi.fn().mockResolvedValue({
          id: 42,
          firstname: 'Ada',
          lastname: 'Lovelace',
          email: 'user@example.test',
          organisation: null,
          emergencyContact: null,
          emailVerifiedAt: verifiedAt,
        }),
      },
    };

    const result = await updateAuthenticatedUser(db as never, auth, {
      email: ' USER@Example.Test ',
      firstname: 'Ada',
      lastname: 'Lovelace',
    });

    expect(result.emailVerifiedAt).toBe(verifiedAt);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        email: 'user@example.test',
        firstname: 'Ada',
        lastname: 'Lovelace',
      },
    });
    expect(authServiceMock.sendVerificationEmailHelper).not.toHaveBeenCalled();
  });
});

describe('user GraphQL service anonymizeCurrentUserAccount', () => {
  beforeEach(() => {
    Object.values(authServiceMock).forEach((mock) => mock.mockReset());
    Object.values(eventServiceMock).forEach((mock) => mock.mockReset());
  });

  it('requires JWT authentication', async () => {
    await expect(
      anonymizeCurrentUserAccount(
        { isAuthenticated: true, type: 'eventBasic', userId: 42, eventId: 'event-1' },
        { currentPassword: 'secret', deleteEvents: false },
      ),
    ).rejects.toMatchObject({
      message: 'Unauthorized: JWT credentials are required',
    });
  });
});
