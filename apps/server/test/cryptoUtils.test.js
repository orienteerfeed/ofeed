import { expect } from 'chai';
import { encrypt, decrypt } from '../src/utils/cryptoUtils.js';
import dotenvFlow from 'dotenv-flow';

// Load environment variables from .env file
dotenvFlow.config();

describe('CryptoUtils', () => {
  describe('encrypt', () => {
    it('should return an object with iv and content', () => {
      const text = 'Hello, World!';
      const result = encrypt(text);

      expect(result).to.have.property('iv').that.is.a('string');
      expect(result).to.have.property('content').that.is.a('string');
    });
  });

  describe('decrypt', () => {
    it('should return the original text after decryption', () => {
      const text = 'Hello, World!';
      const encrypted = encrypt(text);
      const decrypted = decrypt(encrypted);

      expect(decrypted).to.equal(text);
    });
  });
});
