/**
 * Formats validation errors into a string.
 *
 * @param {Array} errors - An array of error objects.
 * @returns {string} A string of formatted error messages.
 */
export const formatErrors = (errors) => {
  if (!Array.isArray(errors) && typeof errors !== 'object') {
    throw new TypeError('Expected an array or object of errors');
  } else if (Array.isArray(errors)) {
    return errors.map((error) => `${error.msg}: ${error.param}`).join(', ');
  } else {
    return errors.array();
  }
};
