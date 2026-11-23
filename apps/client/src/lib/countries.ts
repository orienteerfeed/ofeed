import type { Country } from '@repo/shared';

export function getCountryOptions(
  countries: readonly Country[],
  locale: string
) {
  const names = new Intl.DisplayNames([locale], {
    type: 'region',
    fallback: 'none',
  });
  return countries
    .map(country => ({
      value: country.countryCode,
      label: names.of(country.countryCode) ?? country.countryName,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
