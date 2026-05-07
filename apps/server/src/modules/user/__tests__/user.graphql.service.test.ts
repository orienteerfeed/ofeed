import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError } from '../../../exceptions/index.js';

const authServiceMock = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  changeAuthenticatedUserPassword: vi.fn(),
  passwordResetConfirm: vi.fn(),
  passwordResetRequest: vi.fn(),
  signupUser: vi.fn(),
}));

vi.mock('../../auth/auth.service.js', () => authServiceMock);

import { signIn } from '../user.service.js';

describe('user GraphQL service signIn', () => {
  beforeEach(() => {
    authServiceMock.authenticateUser.mockReset();
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
