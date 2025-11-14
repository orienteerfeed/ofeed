// utils/cryptoUtils.js
import CryptoJS from 'crypto-js';
import dotenvFlow from 'dotenv-flow';

// Load environment variables from .env file
dotenvFlow.config();

const secretKey = process.env.ENCRYPTION_SECRET_KEY;

if (typeof secretKey === 'undefined' || !secretKey) {
  throw new Error('ENCRYPTION_SECRET_KEY is not defined');
}

/**
 * Encrypts a plain text using AES encryption with CBC mode and PKCS7 padding.
 *
 * @param {string} text - The plain text to be encrypted.
 * @returns {Object} An object containing the initialization vector (iv) and the encrypted content.
 * @returns {string} return.iv - The initialization vector in hex format.
 * @returns {string} return.content - The encrypted content.
 * @throws {Error} If encryption fails due to invalid input or incorrect secret key.
 */
export function encrypt(text) {
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(
    text,
    CryptoJS.enc.Hex.parse(secretKey),
    {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );

  return {
    iv: iv.toString(CryptoJS.enc.Hex),
    content: encrypted.toString(),
  };
}

/**
 * Decrypts an AES encrypted hash.
 *
 * @param {Object} hash - The encrypted hash object.
 * @param {string} hash.content - The encrypted content in hex format.
 * @param {string} hash.iv - The initialization vector in hex format.
 * @returns {string} The decrypted content as a UTF-8 string.
 * @throws {Error} If decryption fails due to invalid input or incorrect secret key.
 */
export function decrypt(hash) {
  const decrypted = CryptoJS.AES.decrypt(
    hash.content,
    CryptoJS.enc.Hex.parse(secretKey),
    {
      iv: CryptoJS.enc.Hex.parse(hash.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );

  return decrypted.toString(CryptoJS.enc.Utf8);
}

// Function to Base64 encode the entire encrypted object
export const encodeBase64 = (data) => {
  const jsonString = JSON.stringify(data); // Convert object to JSON string
  return Buffer.from(jsonString).toString('base64'); // Encode JSON string in Base64
};

// Function to decode a Base64 string and convert it back to the original object
export const decodeBase64 = (base64String) => {
  const jsonString = Buffer.from(base64String, 'base64').toString(); // Decode Base64 string into JSON string
  return JSON.parse(jsonString); // Parse JSON string back into an object
};
