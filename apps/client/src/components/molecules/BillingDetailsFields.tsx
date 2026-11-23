import { getCountryOptions } from '@/lib/countries';
import { useId, type ReactNode } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useTranslation } from 'react-i18next';
import type { BillingDetails, OrganizerDetails } from '@repo/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Field, type AnyReactFormApi } from '@/components/organisms/Field';

const COUNTRIES = gql`
  query BillingCountries {
    countries {
      countryCode
      countryName
    }
  }
`;
export const emptyBillingDetails: OrganizerDetails = {
  name: '',
  street: '',
  city: '',
  postalCode: '',
  country: 'CZ',
  companyId: '',
  vatId: '',
};
export function BillingDetailsFields<TFormData>({
  value,
  onChange,
  form,
  countryFieldName,
  organizer = false,
  nameControl,
  onCompanyIdChange,
}: {
  form: AnyReactFormApi<TFormData>;
  countryFieldName: string;
  value: BillingDetails;
  onChange: (value: OrganizerDetails) => void;
  organizer?: boolean;
  nameControl?: (id: string) => ReactNode;
  onCompanyIdChange?: (companyId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage ?? i18n?.language ?? 'cs';
  const id = useId();
  const { data, error } = useQuery<{
    countries: { countryCode: string; countryName: string }[];
  }>(COUNTRIES);
  const countries = getCountryOptions(data?.countries ?? [], locale);
  const keys = [
    'name',
    ...(organizer ? (['companyId'] as const) : []),
    'street',
    'city',
    'postalCode',
    'country',
    ...(!organizer ? (['companyId'] as const) : []),
    'vatId',
  ] as const;
  const labels = {
    name: 'Name',
    street: 'Street',
    city: 'City',
    postalCode: 'PostalCode',
    country: 'Country',
    companyId: 'CompanyId',
    vatId: 'VatId',
  } as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {keys.map(key => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`${id}-${key}`}>{t(`Billing.${labels[key]}`)}</Label>
          {key === 'name' && nameControl ? (
            nameControl(`${id}-${key}`)
          ) : key === 'country' ? (
            <>
              <Field
                form={form}
                name={countryFieldName}
                type="select"
                id={`${id}-${key}`}
                className="w-full"
                placeholder={t('Billing.Country')}
                required
                options={[
                  ...(value.country &&
                  !countries.some(country => country.value === value.country)
                    ? [{ value: value.country, label: value.country }]
                    : []),
                  ...countries,
                ]}
                onValueChange={(country: string) =>
                  onChange({
                    ...value,
                    companyId: value.companyId ?? '',
                    country,
                  })
                }
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {t('Billing.CountriesFailed')}
                </p>
              )}
            </>
          ) : (
            <Input
              id={`${id}-${key}`}
              value={value[key] ?? ''}
              maxLength={
                key === 'postalCode'
                  ? 20
                  : key === 'companyId' || key === 'vatId'
                    ? 32
                    : 191
              }
              required={key !== 'vatId' && (key !== 'companyId' || organizer)}
              onChange={event => {
                onChange({
                  ...value,
                  companyId: value.companyId ?? '',
                  [key]: event.target.value,
                });
                if (key === 'companyId')
                  onCompanyIdChange?.(event.target.value);
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
