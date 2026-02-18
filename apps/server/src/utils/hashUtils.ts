import crypto from 'crypto';

type HashInput = string | number;

export const createShortCompetitorHash = (
  classId: HashInput,
  familyName: HashInput,
  givenName: HashInput,
): string => {
  // Normalize and combine inputs
  const input = `${classId}-${familyName}-${givenName}`.toLowerCase();

  // Simple hash function (DJB2-like)
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }

  // Convert to a positive number and limit to 10 characters
  return Math.abs(hash).toString().slice(0, 10);
};

export const generateResetPasswordToken = (userId: string | number): string => {
  const salt = crypto.randomBytes(16).toString('hex'); // Generate a random salt
  const rawToken = `${userId}.${salt}`; // Combine user ID with salt
  const resetToken = crypto.createHash('sha256').update(rawToken).digest('hex'); // Hash it

  return resetToken;
};
