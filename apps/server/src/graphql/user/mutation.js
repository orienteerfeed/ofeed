import {
  authenticateUser,
  signupUser,
  passwordResetRequest,
  passwordResetConfirm,
} from '../../modules/auth/authService.js';

export const signin = async (_, { input }, context) => {
  // Implement signin logic here
  const { username, password } = input;

  try {
    const loginSuccessPayload = await authenticateUser(username, password);
    return {
      token: loginSuccessPayload.token,
      user: {
        id: loginSuccessPayload.user.userId,
        firstname: loginSuccessPayload.user.firstName,
        lastname: loginSuccessPayload.user.lastName,
        email: username,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

export const signup = async (_, { input }, context) => {
  // Implement signup logic here
  // Example: Check if user exists, hash password, save to DB, generate JWT
  const { email, password, firstname, lastname } = input;

  try {
    const signUpPayload = await signupUser(
      email,
      password,
      firstname,
      lastname,
      context.activationUrl,
    );
    return {
      token: signUpPayload.token,
      user: {
        id: signUpPayload.user.id,
        firstname: firstname,
        lastname: lastname,
        email: email,
      },
      message: 'User successfuly created',
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

export const requestPasswordReset = async (_, { email }, context) => {
  // Example: Check if user exists, hash password, save to DB, generate JWT

  // Get password reset base URL from headers
  const passwordResetBaseUrl = context.resetPasswordUrl;
  if (!passwordResetBaseUrl)
    throw new Error('Missing password reset URL in headers');

  try {
    const passwordResetPayload = await passwordResetRequest(
      email,
      passwordResetBaseUrl,
    );
    return {
      success: passwordResetPayload.success,
      message: passwordResetPayload.message,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

export const resetPassword = async (_, { token, newPassword }, context) => {
  try {
    const passwordResetPayload = await passwordResetConfirm(token, newPassword);
    return {
      token: passwordResetPayload.jwtToken,
      user: passwordResetPayload.user,
      message: 'Password reset successful',
    };
  } catch (error) {
    throw new Error(error.message);
  }
};
