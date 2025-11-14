import crypto from 'crypto';

/**
 * Generate a random hexadecimal string of the specified length.
 * @param {number} length - The length of the string to generate.
 * @returns {string} The generated hexadecimal string.
 * @throws {Error} If length is not a positive integer.
 */
export const generateRandomHex = (length) => {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }
  return crypto.randomBytes(length / 2).toString('hex');
};
