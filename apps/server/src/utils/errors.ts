type ErrorItem = {
  msg: string;
  param: string;
};

type ErrorArrayProvider = {
  array: () => string | ErrorItem[];
};

function isErrorArrayProvider(value: unknown): value is ErrorArrayProvider {
  return Boolean(value) && typeof value === 'object' && 'array' in value && typeof value.array === 'function';
}

function formatErrorItems(errors: ErrorItem[]) {
  return errors.map((error: ErrorItem) => `${error.msg}: ${error.param}`).join(', ');
}

/**
 * Formats validation errors into a string.
 */
export const formatErrors = (errors: unknown): string => {
  if (Array.isArray(errors)) {
    return formatErrorItems(errors as ErrorItem[]);
  }

  if (!isErrorArrayProvider(errors)) {
    throw new TypeError('Expected an array or object of errors');
  }

  const errorArray = errors.array();
  if (Array.isArray(errorArray)) {
    return formatErrorItems(errorArray);
  }

  return String(errorArray);
};
