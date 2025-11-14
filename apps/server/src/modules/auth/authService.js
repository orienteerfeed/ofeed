import argon2 from 'argon2';
import crypto from 'crypto';
import ejs from 'ejs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  AuthenticationError,
  DatabaseError,
  ValidationError,
} from '../../exceptions/index.js';
import prisma from '../../utils/context.js';
import { generateJwtTokenForLink } from '../../utils/jwtToken.js';
import { getLoginSuccessPayload } from '../../utils/loginUser.js';
import { sendEmail } from '../../utils/email.js';
import { generateResetPasswordToken } from '../../utils/hashUtils.js';

// Correctly calculate the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// An asynchronous function to handle user authentication
export const authenticateUser = async (username, password) => {
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
    console.error(err);
    throw new DatabaseError(`An error occurred: ` + err.message);
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
  email,
  password,
  firstname,
  lastname,
  app_base_url,
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
        active: true,
      },
    });

    // Generate JWT token for email link
    const loginSuccessPayload = await getLoginSuccessPayload({
      userId: user.id,
      prisma,
    });
    const { token } = loginSuccessPayload;
    // Construct the link to be sent via email
    const registrationConfirmFeAppLink = `${app_base_url}/${token}`;

    // Prepare and send the email
    let emailTemplate;
    // Calculate the path to the ejs file
    const templatePath = path.join(__dirname, '../../views/emails/welcome.ejs');

    await ejs
      .renderFile(templatePath, {
        user_firstname: firstname,
        user_lastname: lastname,
        user_email: email,
        confirm_link: registrationConfirmFeAppLink,
        year: new Date().getFullYear(),
      })
      .then((result) => {
        emailTemplate = result;
      })
      .catch((err) => {
        throw new ValidationError('Error Rendering email template: ' + err);
      });

    sendEmail({
      html: emailTemplate,
      text: 'OrienteerFeed',
      subject: 'Orienteering Cloud Data Hub - registration',
      emailTo: email,
      onSuccess: () => console.log('Email sent successfully!'),
      onError: (error) => {
        throw new Error('Failed to send email:' + error);
      },
    });
    // Return both the token and the user object
    return { token, user };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // rethrow to be handled by the caller
    }
    console.error('Database error in createUser:', error);
    throw new DatabaseError('Failed to create user');
  }
};

// Function to sign up a user and send a registration confirmation email
export const passwordResetRequest = async (email, app_base_url) => {
  const successResponse = {
    success: true,
    message:
      'Please check your inbox and follow the instructions to reset your password.',
  };
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      return successResponse;
    }
    const token = generateResetPasswordToken(existingUser.id);
    const createdAt = new Date(Date.now());

    try {
      await prisma.passwordReset.upsert({
        where: { email }, // Find existing record by email
        update: { token, createdAt }, // Update token & expiration if exists
        create: { email, token, createdAt }, // Create new record if not found
      });
    } catch (error) {
      console.error('Error creating or updating password reset record:', error);
      throw new Error('Could not process password reset request.');
    }

    // Construct the link to be sent via email
    const resetPasswordAppLink = `${app_base_url}/${token}`;

    // Prepare and send the email
    let emailTemplate;
    // Calculate the path to the ejs file
    const templatePath = path.join(
      __dirname,
      '../../views/emails/password-reset.ejs',
    );

    await ejs
      .renderFile(templatePath, {
        user_firstname: existingUser.firstname,
        password_reset_link: resetPasswordAppLink,
        year: new Date().getFullYear(),
      })
      .then((result) => {
        emailTemplate = result;
      })
      .catch((err) => {
        throw new ValidationError('Error Rendering email template: ' + err);
      });

    sendEmail({
      html: emailTemplate,
      text: 'OrienteerFeed',
      subject: 'OrienteerFeed - forgotten password',
      emailTo: email,
      onSuccess: () => console.log('Email sent successfully!'),
      onError: (error) => {
        throw new Error('Failed to send email:' + error);
      },
    });
    // Return both the token and the user object
    return successResponse;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // rethrow to be handled by the caller
    }
    console.error('Database error in password reset:', error);
    throw new DatabaseError('Failed to create password reset request');
  }
};

export const passwordResetConfirm = async (token, newPassword) => {
  try {
    // Find the password reset request
    const passwordRequest = await prisma.passwordReset.findFirst({
      where: { token: token },
    });

    if (!passwordRequest) {
      throw new ValidationError('Password reset token expired or invalid.');
    }

    // Get current time and subtract 1 hour (60 * 60 * 1000 ms)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    // Convert timestamps to Date objects and compare
    const tokenCreatedAt = new Date(passwordRequest.createdAt);

    if (tokenCreatedAt < oneHourAgo) {
      throw new ValidationError('Password reset token expired.');
    }

    // Find the user to reset password
    const user = await prisma.user.findUnique({
      where: { email: passwordRequest.email },
    });

    if (!passwordRequest) {
      throw new ValidationError('Password reset token invalid.');
    }

    // Generate a random 128-bit (16 bytes) salt
    const salt = crypto.randomBytes(16);
    const hashedPassword = await argon2.hash(newPassword, { salt });

    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    // Delete the used password reset token
    await prisma.passwordReset.delete({
      where: { email: user.email },
    });

    // Generate JWT token for email link
    const jwtToken = generateJwtTokenForLink(user.id);

    // Return both the token and the user object
    return { jwtToken, user };
  } catch (error) {
    console.error('Error in confirmPasswordReset:', error);
    throw new DatabaseError('Failed to reset password.');
  }
};
