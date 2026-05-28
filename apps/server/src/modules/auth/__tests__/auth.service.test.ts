import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    deleteMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const ejsMock = vi.hoisted(() => ({
  renderFile: vi.fn(),
}));

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

vi.mock('../../../utils/email.js', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('ejs', () => ({
  default: ejsMock,
}));

import { generateJwtTokenForLink } from '../../../utils/jwtToken.js';
import { passwordResetConfirm, passwordResetRequest, signupUser, verifyEmail } from '../auth.service.js';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

describe('auth service signupUser', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.create.mockReset();
    prismaMock.user.findFirst.mockReset();
    prismaMock.user.update.mockReset();
    ejsMock.renderFile.mockReset();
    sendEmailMock.mockReset();
  });

  it('returns the created account payload when welcome email rendering fails', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 123,
      email: 'runner@example.test',
      firstname: 'Test',
      lastname: 'Runner',
      role: 'USER',
      organisation: 'OK Test',
      emergencyContact: null,
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: 123,
      email: 'runner@example.test',
      firstname: 'Test',
      lastname: 'Runner',
      role: 'USER',
      organisation: 'OK Test',
      emergencyContact: null,
    });
    ejsMock.renderFile.mockRejectedValue(new Error('template missing'));

    const payload = await signupUser(
      'runner@example.test',
      'secret-password',
      'Test',
      'Runner',
      'https://app.example.test/verify-email',
      'OK Test',
    );

    expect(payload.user).toMatchObject({
      id: 123,
      email: 'runner@example.test',
      firstname: 'Test',
      lastname: 'Runner',
      organisation: 'OK Test',
    });
    expect(payload.token).toEqual(expect.any(String));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('auth service verifyEmail', () => {
  beforeEach(() => {
    prismaMock.user.findFirst.mockReset();
    prismaMock.user.update.mockReset();
  });

  it('sets emailVerifiedAt and returns a login payload when token is valid', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce({
        id: 123,
        emailVerifiedAt: null,
      })
      .mockResolvedValueOnce({
        id: 123,
        email: 'runner@example.test',
        firstname: 'Test',
        lastname: 'Runner',
        role: 'USER',
        organisation: 'OK Test',
        emergencyContact: null,
      });
    prismaMock.user.update.mockResolvedValue({});

    const payload = await verifyEmail(generateJwtTokenForLink(123));

    expect(payload).toMatchObject({
      token: expect.any(String),
      user: {
        userId: 123,
        email: 'runner@example.test',
        firstName: 'Test',
        lastName: 'Runner',
        role: 'USER',
        organisation: 'OK Test',
        emergencyContact: null,
      },
    });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 123, active: true },
        select: { id: true, emailVerifiedAt: true },
      }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 123 },
        data: { emailVerifiedAt: expect.any(Date) },
      }),
    );
  });

  it('skips update when email is already verified (idempotent)', async () => {
    const alreadyVerifiedAt = new Date('2025-01-01T00:00:00Z');
    prismaMock.user.findFirst
      .mockResolvedValueOnce({
        id: 123,
        emailVerifiedAt: alreadyVerifiedAt,
      })
      .mockResolvedValueOnce({
        id: 123,
        email: 'runner@example.test',
        firstname: 'Test',
        lastname: 'Runner',
        role: 'USER',
        organisation: 'OK Test',
        emergencyContact: null,
      });

    const payload = await verifyEmail(generateJwtTokenForLink(123));

    expect(payload.token).toEqual(expect.any(String));
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('throws ValidationError for an expired or invalid token', async () => {
    await expect(verifyEmail('invalid-or-expired-token')).rejects.toThrow(
      'Verification token is invalid or expired.',
    );
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('throws ValidationError when user is not found for the token', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(verifyEmail(generateJwtTokenForLink(999))).rejects.toThrow(
      'Verification token is invalid.',
    );
  });
});

describe('auth service passwordResetRequest', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.passwordResetToken.deleteMany.mockReset();
    prismaMock.passwordResetToken.create.mockReset();
    ejsMock.renderFile.mockReset();
    sendEmailMock.mockReset();
  });

  it('returns generic success without creating a token when email is not registered', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await passwordResetRequest('unknown@example.test', 'https://app.test/auth/reset-password');

    expect(result).toMatchObject({ success: true });
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns generic success without creating a token when user account is inactive', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 42, firstname: 'Test', active: false });

    const result = await passwordResetRequest('inactive@example.test', 'https://app.test/auth/reset-password');

    expect(result).toMatchObject({ success: true });
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('creates a hashed token record and fires the reset email for an active user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 77, firstname: 'Jana', active: true });
    prismaMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.passwordResetToken.create.mockResolvedValue({});
    ejsMock.renderFile.mockResolvedValue('<html>reset link</html>');

    const result = await passwordResetRequest('jana@example.test', 'https://app.test/auth/reset-password');

    expect(result).toMatchObject({ success: true });
    expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 77, usedAt: null },
    });
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 77,
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailTo: 'jana@example.test',
        subject: 'OrienteerFeed - forgotten password',
      }),
    );

    // Verify that the raw token never ends up in the stored tokenHash
    const createCall = prismaMock.passwordResetToken.create.mock.calls[0][0] as { data: { tokenHash: string } };
    const storedHash = createCall.data.tokenHash;
    // storedHash must be a SHA-256 hex string (64 chars), not the raw token itself
    expect(storedHash).toHaveLength(64);
    expect(storedHash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns success even when email template rendering fails', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 77, firstname: 'Jana', active: true });
    prismaMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.passwordResetToken.create.mockResolvedValue({});
    ejsMock.renderFile.mockRejectedValue(new Error('template error'));

    const result = await passwordResetRequest('jana@example.test', 'https://app.test/auth/reset-password');

    expect(result).toMatchObject({ success: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('auth service passwordResetConfirm', () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
  const pastExpiry = new Date(Date.now() - 60 * 60 * 1000);

  beforeEach(() => {
    prismaMock.passwordResetToken.findUnique.mockReset();
    prismaMock.passwordResetToken.update.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.update.mockReset();
  });

  it('throws ValidationError when token does not exist in the database', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(passwordResetConfirm(rawToken, 'newpassword8')).rejects.toThrow(
      'Password reset token invalid or expired.',
    );
  });

  it('throws ValidationError when token has already been used', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 'tok1',
      userId: 77,
      expiresAt: futureExpiry,
      usedAt: new Date('2025-01-01'),
    });

    await expect(passwordResetConfirm(rawToken, 'newpassword8')).rejects.toThrow(
      'Password reset token has already been used.',
    );
  });

  it('throws ValidationError when token has expired', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 'tok1',
      userId: 77,
      expiresAt: pastExpiry,
      usedAt: null,
    });

    await expect(passwordResetConfirm(rawToken, 'newpassword8')).rejects.toThrow(
      'Password reset token has expired.',
    );
  });

  it('throws ValidationError when new password is too short', async () => {
    await expect(passwordResetConfirm(rawToken, 'short')).rejects.toThrow(
      'New password must be at least 8 characters long.',
    );
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('updates password and marks token used for a valid token', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 'tok1',
      userId: 77,
      expiresAt: futureExpiry,
      usedAt: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 77,
      email: 'runner@example.test',
      active: true,
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.passwordResetToken.update.mockResolvedValue({});

    const result = await passwordResetConfirm(rawToken, 'newpassword8');

    expect(result.jwtToken).toEqual(expect.any(String));

    expect(prismaMock.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77 },
        data: { password: expect.any(String) },
      }),
    );
    expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: 'tok1' },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('throws ValidationError when user is not found or inactive after token lookup', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 'tok1',
      userId: 99,
      expiresAt: futureExpiry,
      usedAt: null,
    });
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(passwordResetConfirm(rawToken, 'newpassword8')).rejects.toThrow(
      'Password reset token invalid or expired.',
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
