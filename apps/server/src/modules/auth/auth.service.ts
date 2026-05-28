import argon2 from 'argon2';
import crypto from 'crypto';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuthenticationError, DatabaseError, ValidationError } from '../../exceptions/index.js';
import { logger } from '../../lib/logging.js';
import prisma from '../../utils/context.js';
import { sendEmail } from '../../utils/email.js';
import { generateJwtTokenForLink, getJwtToken, getUserIdFromEmailVerificationToken } from '../../utils/jwtToken.js';
import { getLoginSuccessPayload } from '../../utils/loginUser.js';

type SignupUserPayload = {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  appBaseUrl: string;
  organisation?: string | null;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logEmailFailure(context: string, error: unknown): void {
  logger.error(context, { action: context, error: getErrorMessage(error) });
}

export async function sendVerificationEmailHelper(
  firstname: string,
  lastname: string,
  email: string,
  verificationLink: string,
): Promise<void> {
  const templatePath = path.join(__dirname, '../../views/emails/welcome.ejs');
  try {
    const emailTemplate = await ejs.renderFile(templatePath, {
      user_firstname: firstname,
      user_lastname: lastname,
      user_email: email,
      confirm_link: verificationLink,
      year: new Date().getFullYear(),
    });
    sendEmail({
      html: emailTemplate,
      text: 'OFeed',
      subject: 'OFeed - verify your email',
      emailTo: email,
      onSuccess: () => logger.info('Verification email sent', { action: 'verification-email' }),
      onError: (error) => logEmailFailure('Failed to send verification email', error),
    });
  } catch (error) {
    logEmailFailure('Failed to render verification email', error);
  }
}

// Correctly calculate the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// An asynchronous function to handle user authentication
export const authenticateUser = async (username: string, password: string) => {
  // Attempt to find the first user in the database with the provided email (username).
  let user;
  try {
    user = await prisma.user.findFirst({
      where: {
        email: username, // Assuming email is used as the username.
      },
      select: { id: true, password: true, active: true },
    });
  } catch (err) {
    logger.error('Database error in authenticateUser', { action: 'authenticate-user', error: getErrorMessage(err) });
    throw new DatabaseError(`An error occurred: ` + getErrorMessage(err));
  }

  // If no user is found, throw an authentication error.
  // This avoids giving out information on whether the email is registered.
  if (user === null) {
    // For not found user, we should return same error as for bad password to not allowed guesing emails
    throw new AuthenticationError('Login failed');
  }

  // Destructure password hash and user ID from the found user object.
  const { password: passwordHash, id: userId } = user;

  // Verify the provided password against the stored hash using Argon2.
  const valid = await argon2.verify(passwordHash, password);

  // If the password is not valid, throw an authentication error.
  if (!valid) {
    throw new AuthenticationError('Login failed');
  }

  // Check if the user account is activated.
  if (user.active === false) {
    throw new AuthenticationError('User account is not activated');
  }

  // If the login is successful, compute the login success payload, potentially including
  // token creation, user roles, etc., depending on your application's requirements.
  const loginSuccessPayload = await getLoginSuccessPayload({
    userId,
    prisma,
  });

  return loginSuccessPayload;
};

// Function to sign up a user and send a registration confirmation email
export const signupUser = async (
  email: SignupUserPayload['email'],
  password: SignupUserPayload['password'],
  firstname: SignupUserPayload['firstname'],
  lastname: SignupUserPayload['lastname'],
  app_base_url: SignupUserPayload['appBaseUrl'],
  organisation: SignupUserPayload['organisation'] = null,
) => {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ValidationError('Email already in use');
    }

    // Generate a random 128-bit (16 bytes) salt
    const salt = crypto.randomBytes(16);
    const hashedPassword = await argon2.hash(password, { salt });

    // Create the user in the database
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstname,
        lastname,
        organisation,
        active: true,
      },
    });

    // Generate JWT login token — user is active immediately
    const loginSuccessPayload = await getLoginSuccessPayload({
      userId: user.id,
      prisma,
    });
    const { token } = loginSuccessPayload;

    // Generate separate 48h token for email verification link (does not block login)
    const verificationToken = generateJwtTokenForLink(user.id);
    const verificationLink = `${app_base_url}/${verificationToken}`;
    await sendVerificationEmailHelper(firstname, lastname, email, verificationLink);

    // Return both the login token and the created user object
    return { token, user };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // rethrow to be handled by the caller
    }
    logger.error('Database error in signupUser', { action: 'signup-user', error: getErrorMessage(error) });
    throw new DatabaseError('Failed to create user');
  }
};

export const verifyEmail = async (token: string) => {
  if (!token) {
    throw new ValidationError('Verification token is required.');
  }

  try {
    const rawId = getUserIdFromEmailVerificationToken(token);
    const userId = Number(rawId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError('Verification token is invalid.');
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, active: true },
      select: { id: true, emailVerifiedAt: true },
    });

    if (!user) {
      throw new ValidationError('Verification token is invalid.');
    }

    // Idempotent: only update if not yet verified
    if (!user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
    }

    return await getLoginSuccessPayload({ userId, prisma });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    if (error instanceof Error && error.message === 'Invalid or expired token') {
      throw new ValidationError('Verification token is invalid or expired.');
    }
    throw error;
  }
};

function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export const passwordResetRequest = async (email: string, app_base_url: string) => {
  const successResponse = {
    success: true,
    message: 'Please check your inbox and follow the instructions to reset your password.',
  };

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstname: true, active: true },
  });

  // Always return success to prevent email enumeration
  if (!existingUser || !existingUser.active) {
    return successResponse;
  }

  // 256-bit raw token — never stored, sent only in the email link
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Delete previous unused tokens for this user to keep the table clean
  await prisma.passwordResetToken.deleteMany({
    where: { userId: existingUser.id, usedAt: null },
  });

  await prisma.passwordResetToken.create({
    data: { userId: existingUser.id, tokenHash, expiresAt },
  });

  const resetPasswordAppLink = `${app_base_url}/${rawToken}`;
  const templatePath = path.join(__dirname, '../../views/emails/password-reset.ejs');

  try {
    const emailTemplate = await ejs.renderFile(templatePath, {
      user_firstname: existingUser.firstname,
      password_reset_link: resetPasswordAppLink,
      year: new Date().getFullYear(),
    });

    sendEmail({
      html: emailTemplate,
      text: 'OrienteerFeed',
      subject: 'OrienteerFeed - forgotten password',
      emailTo: email,
      onSuccess: () => logger.info('Password reset email sent', { action: 'password-reset-email' }),
      onError: (error) => logger.error('Failed to send password reset email', { action: 'password-reset-email', error: getErrorMessage(error) }),
    });
  } catch (error) {
    logger.error('Failed to render password reset email template', { action: 'password-reset-template', error: getErrorMessage(error) });
  }

  return successResponse;
};

export const passwordResetConfirm = async (token: string, newPassword: string) => {
  if (!token) {
    throw new ValidationError('Password reset token is required.');
  }

  if (!newPassword || newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters long.');
  }

  const tokenHash = hashResetToken(token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!resetToken) {
    throw new ValidationError('Password reset token invalid or expired.');
  }

  if (resetToken.usedAt !== null) {
    throw new ValidationError('Password reset token has already been used.');
  }

  if (resetToken.expiresAt < new Date()) {
    throw new ValidationError('Password reset token has expired.');
  }

  const user = await prisma.user.findUnique({
    where: { id: resetToken.userId },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      role: true,
      organisation: true,
      emergencyContact: true,
      active: true,
    },
  });

  if (!user || !user.active) {
    throw new ValidationError('Password reset token invalid or expired.');
  }

  const salt = crypto.randomBytes(16);
  const hashedPassword = await argon2.hash(newPassword, { salt });

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  // Mark token as used (single-use enforcement, audit trail kept)
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { usedAt: new Date() },
  });

  const jwtToken = getJwtToken({ userId: user.id });

  return { jwtToken, user };
};

export const changeAuthenticatedUserPassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string,
) => {
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required.');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters long.');
  }

  if (currentPassword === newPassword) {
    throw new ValidationError('New password must be different from current password.');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new AuthenticationError('Unauthorized: Invalid user.');
    }

    const isCurrentPasswordValid = await argon2.verify(user.password, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new AuthenticationError('Current password is incorrect.');
    }

    const salt = crypto.randomBytes(16);
    const hashedPassword = await argon2.hash(newPassword, { salt });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Password updated successfully',
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthenticationError) {
      throw error;
    }

    logger.error('Error in changeAuthenticatedUserPassword', { action: 'change-password', error: getErrorMessage(error) });
    throw new DatabaseError('Failed to update password.');
  }
};
