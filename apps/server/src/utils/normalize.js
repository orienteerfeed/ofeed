export const normalizeValue = (type, value) => {
  if (value === undefined || value === null) return null;

  switch (type) {
    case 'date':
      if (typeof value === 'string') {
        return new Date(value).getTime(); // Convert ISO string to timestamp
      }
      if (value instanceof Date) {
        return value.getTime(); // Convert Date object to timestamp
      }
      return null;

    case 'number':
      return isNaN(value) ? null : Number(value); // Ensure it's a number

    case 'string':
      return typeof value === 'string' ? value.trim() : String(value); // Trim and ensure it's a string

    default:
      return value; // Fallback for unexpected types
  }
};
