import type { AnyReactFormApi } from '@/components/organisms/Field';
import { useEffect, useId, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import { useApolloClient } from '@apollo/client/react';
import { useTranslation } from 'react-i18next';
import { organizerDetailsSchema, type OrganizerDetails } from '@repo/shared';
import { BillingDetailsFields } from '@/components/molecules/BillingDetailsFields';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const FIELDS = gql`
  fragment AresOrganizerFields on OrganizerDetails {
    name
    street
    city
    postalCode
    country
    companyId
    vatId
  }
`;
const SEARCH = gql`
  query SearchOrganizerAres($eventId: String!, $name: String!) {
    searchOrganizerAres(eventId: $eventId, name: $name) {
      ...AresOrganizerFields
    }
  }
  ${FIELDS}
`;
const DETAIL = gql`
  query OrganizerAres($eventId: String!, $companyId: String!) {
    organizerAres(eventId: $eventId, companyId: $companyId) {
      ...AresOrganizerFields
    }
  }
  ${FIELDS}
`;

export function OrganizerBillingFields<TFormData>({
  eventId,
  form,
  value,
  onChange,
}: {
  form: AnyReactFormApi<TFormData>;
  eventId: string;
  value: OrganizerDetails;
  onChange: (value: OrganizerDetails) => void;
}) {
  const { t } = useTranslation();
  const client = useApolloClient();
  const id = useId();
  const [request, setRequest] = useState<{
    name?: string;
    companyId?: string;
  } | null>(null);
  const [results, setResults] = useState<OrganizerDetails[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>(
    'idle'
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const version = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const edit = (next: OrganizerDetails) => {
    version.current++;
    setRequest(null);
    setResults([]);
    setActiveIndex(-1);
    setStatus('idle');
    onChange({ ...next, aresVerifiedAt: undefined });
  };
  useEffect(() => {
    if (!request) return;
    const current = version.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        if (request.companyId) {
          const response = await client.query<{
            organizerAres: OrganizerDetails | null;
          }>({
            query: DETAIL,
            variables: { eventId, companyId: request.companyId },
            fetchPolicy: 'network-only',
          });
          if (cancelled || current !== version.current) return;
          const organizer = response.data?.organizerAres;
          setResults([]);
          setStatus(organizer ? 'idle' : 'empty');
          if (organizer) {
            // Pick only editable fields: Apollo metadata must not reach mutation input.
            onChangeRef.current({
              name: organizer.name,
              street: organizer.street,
              city: organizer.city,
              postalCode: organizer.postalCode,
              country: organizer.country,
              companyId: organizer.companyId,
              vatId: organizer.vatId ?? '',
              aresVerifiedAt: organizerDetailsSchema.safeParse({
                ...organizer,
                vatId: organizer.vatId ?? undefined,
              }).success
                ? new Date().toISOString()
                : undefined,
            });
          }
        } else {
          const response = await client.query<{
            searchOrganizerAres: OrganizerDetails[];
          }>({
            query: SEARCH,
            variables: { eventId, name: request.name },
            fetchPolicy: 'network-only',
          });
          if (cancelled || current !== version.current) return;
          const matches = response.data?.searchOrganizerAres ?? [];
          setResults(matches);
          setActiveIndex(-1);
          setStatus(matches.length ? 'idle' : 'empty');
        }
      } catch {
        if (!cancelled && current === version.current) setStatus('error');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, eventId, request]);
  const select = (organizer: OrganizerDetails) => {
    version.current++;
    setResults([]);
    setActiveIndex(-1);
    setRequest({ companyId: organizer.companyId });
  };
  return (
    <div className="space-y-3">
      {value.aresVerifiedAt && (
        <Badge variant="secondary">{t('Billing.AresVerified')}</Badge>
      )}
      <BillingDetailsFields
        form={form}
        countryFieldName="organizer.country"
        organizer
        value={value}
        onChange={edit}
        onCompanyIdChange={companyId => {
          if (/^\d{8}$/.test(companyId.trim()))
            setRequest({ companyId: companyId.trim() });
        }}
        nameControl={inputId => (
          <div className="relative">
            <Input
              id={inputId}
              value={value.name}
              required
              maxLength={191}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={results.length > 0}
              aria-controls={`${id}-results`}
              aria-activedescendant={
                results.length > 0 && activeIndex >= 0
                  ? `${id}-option-${activeIndex}`
                  : undefined
              }
              autoComplete="off"
              onChange={event => {
                const name = event.target.value;
                edit({ ...value, name });
                if (name.trim().length >= 3) setRequest({ name: name.trim() });
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  version.current++;
                  setRequest(null);
                  setResults([]);
                  setActiveIndex(-1);
                  setStatus('idle');
                }
                if (!results.length) return;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex(
                    index =>
                      (index +
                        (event.key === 'ArrowDown' ? 1 : results.length - 1) +
                        results.length) %
                      results.length
                  );
                }
                if (
                  event.key === 'Enter' &&
                  activeIndex >= 0 &&
                  results[activeIndex]
                ) {
                  event.preventDefault();
                  select(results[activeIndex]);
                }
              }}
            />
            {results.length > 0 && (
              <ul
                id={`${id}-results`}
                role="listbox"
                aria-label={t('Billing.AresResults')}
                className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
              >
                {results.map((organizer, index) => (
                  <li
                    key={organizer.companyId}
                    role="option"
                    id={`${id}-option-${index}`}
                    aria-selected={index === activeIndex}
                  >
                    <button
                      type="button"
                      className={`w-full rounded p-2 text-left text-sm hover:bg-accent ${index === activeIndex ? 'bg-accent' : ''}`}
                      onClick={() => select(organizer)}
                    >
                      {organizer.name} · {organizer.companyId}
                      <span className="block text-muted-foreground">
                        {organizer.city}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      />
      <p
        role={status === 'error' ? 'alert' : 'status'}
        className="text-sm text-muted-foreground"
      >
        {t(
          status === 'loading'
            ? 'Billing.AresLoading'
            : status === 'empty'
              ? 'Billing.AresEmpty'
              : status === 'error'
                ? 'Billing.AresFailed'
                : 'Billing.AresHint'
        )}
      </p>
    </div>
  );
}
