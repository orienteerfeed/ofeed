import { expect } from 'chai';
import { formatErrors } from '../src/utils/errors.js';

describe('formatErrors', () => {
  it('should return a string of errors separated by commas when an array of error objects is passed', () => {
    const errors = [
      { msg: 'Error 1', param: 'param1' },
      { msg: 'Error 2', param: 'param2' },
    ];
    const expectedResult = 'Error 1: param1, Error 2: param2';

    expect(formatErrors(errors)).to.equal(expectedResult);
  });

  it('should return an empty string when an empty array is passed', () => {
    const errors = [];

    expect(formatErrors(errors)).to.equal('');
  });

  it('should call array() method if an object with array() method is passed', () => {
    const errors = {
      array: () => 'Formatted error from array method',
    };

    expect(formatErrors(errors)).to.equal('Formatted error from array method');
  });

  it('should throw a TypeError if the input is neither an array nor an object', () => {
    const invalidInput = 'invalid input';

    expect(() => formatErrors(invalidInput)).to.throw(
      TypeError,
      'Expected an array or object of errors',
    );
  });
});
