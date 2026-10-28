/** Return a remainder without losing precision on long IBAN numeric strings. */
function modulo97(digits: string): number {
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder;
}

function validDomesticPart(part: string): boolean {
  return (
    [...part].reverse().reduce((sum, digit, index) => sum + Number(digit) * 2 ** index, 0) % 11 ===
    0
  );
}

/**
 * Normalize a Czech domestic account or an IBAN to electronic IBAN form.
 * Returns null for malformed input/checksums; does not verify account existence.
 */
export function normalizeBankAccountIban(value: string): string | null {
  const compact = value.replaceAll(/\s/g, '').toUpperCase();
  const domestic = /^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/.exec(compact);
  if (domestic) {
    const prefix = domestic[1] ?? '0';
    const account = domestic[2]!;
    const bank = domestic[3]!;
    if (
      /^0+$/.test(account) ||
      bank === '0000' ||
      !validDomesticPart(prefix) ||
      !validDomesticPart(account)
    )
      return null;
    const bban = `${bank}${prefix.padStart(6, '0')}${account.padStart(10, '0')}`;
    return `CZ${String(98 - modulo97(`${bban}123500`)).padStart(2, '0')}${bban}`;
  }

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return null;
  const checkDigits = Number(compact.slice(2, 4));
  if (checkDigits < 2 || checkDigits > 98) return null;
  if (compact.startsWith('CZ')) {
    if (!/^CZ\d{22}$/.test(compact)) return null;
    // Czech IBAN uses the same domestic account parts/checksums.
    if (
      compact.slice(4, 8) === '0000' ||
      /^0+$/.test(compact.slice(14)) ||
      !validDomesticPart(compact.slice(8, 14)) ||
      !validDomesticPart(compact.slice(14))
    )
      return null;
  }
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
  return modulo97(numeric) === 1 ? compact : null;
}
