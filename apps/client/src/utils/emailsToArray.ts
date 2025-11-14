/**
 * Converts a string of emails separated by commas into an array of trimmed email strings
 * @param emails - String containing emails separated by commas
 * @returns Array of trimmed email strings
 */
export const emailsStringToEmailArray = (emails: string): string[] => {
  if (!emails || typeof emails !== 'string') {
    return [];
  }

  return emails
    .split(',')
    .map((email: string) => email.trim())
    .filter((email: string) => !!email);
};
