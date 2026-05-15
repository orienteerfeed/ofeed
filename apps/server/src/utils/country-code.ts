const ALPHA3_TO_ALPHA2_COUNTRIES: Record<string, string> = {
  CZE: 'CZ',
  SVK: 'SK',
  POL: 'PL',
  AUT: 'AT',
  DEU: 'DE',
  SWE: 'SE',
  NOR: 'NO',
  FIN: 'FI',
  DNK: 'DK',
  GBR: 'GB',
  USA: 'US',
  ESP: 'ES',
  FRA: 'FR',
  ITA: 'IT',
  CHE: 'CH',
  HUN: 'HU',
};

const ALPHA2_TO_ALPHA3_COUNTRIES = Object.fromEntries(
  Object.entries(ALPHA3_TO_ALPHA2_COUNTRIES).map(([alpha3, alpha2]) => [alpha2, alpha3]),
) as Record<string, string>;

export function normalizeCountryAlpha2(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^[A-Z]{3}$/.test(normalized)) {
    return ALPHA3_TO_ALPHA2_COUNTRIES[normalized] ?? null;
  }

  return null;
}

export function normalizeCountryAlpha3(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) {
    return ALPHA3_TO_ALPHA2_COUNTRIES[normalized] ? normalized : null;
  }

  if (/^[A-Z]{2}$/.test(normalized)) {
    return ALPHA2_TO_ALPHA3_COUNTRIES[normalized] ?? null;
  }

  return null;
}
