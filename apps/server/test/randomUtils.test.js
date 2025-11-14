// test/randomUtils.test.js
import { expect } from 'chai';
import { generateRandomHex } from '../src/utils/randomUtils.js';

describe('generateRandomHex', () => {
  it('should return a string', () => {
    const length = 16;
    const result = generateRandomHex(length);
    expect(result).to.be.a('string');
  });

  it('should return a string of the specified length', () => {
    const length = 16;
    const result = generateRandomHex(length);
    expect(result).to.have.lengthOf(length);
  });

  it('should return a valid hexadecimal string', () => {
    const length = 16;
    const result = generateRandomHex(length);
    const hexPattern = /^[0-9a-fA-F]+$/;
    expect(result).to.match(hexPattern);
  });

  it('should handle different lengths correctly', () => {
    const lengths = [8, 16, 32, 64];
    lengths.forEach((length) => {
      const result = generateRandomHex(length);
      expect(result).to.have.lengthOf(length);
      expect(result).to.match(/^[0-9a-fA-F]+$/);
    });
  });

  it('should throw an error if length is not a positive integer', () => {
    const invalidLengths = [-1, 0, 'string', null, undefined];
    invalidLengths.forEach((length) => {
      expect(() => generateRandomHex(length)).to.throw();
    });
  });
});
