import type { ClubListItem, RegistrationLookupItem } from '@repo/shared';
import { useField } from '@tanstack/react-form';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AnyReactFormApi } from '@/components/organisms';
import { InputWithHelper } from '@/components/molecules';

import { useClubSearch, useRegistrationLookup } from './registration.hooks';
import type { EntryFormValues } from './entry-form.validation';

const CLUB_SEARCH_MIN_CHARS = 2;
const CLUB_SEARCH_DEBOUNCE_MS = 250;

interface SuggestionListProps<T> {
  items: T[];
  isLoading: boolean;
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  emptyLabel: string;
  loadingLabel: string;
}

function SuggestionList<T>({
  items,
  isLoading,
  getKey,
  renderItem,
  onSelect,
  emptyLabel,
  loadingLabel,
}: SuggestionListProps<T>) {
  return (
    <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-lg">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingLabel}
        </div>
      ) : items.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <ul className="py-1">
          {items.map(item => (
            <li key={getKey(item)}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={event => event.preventDefault()}
                onClick={() => onSelect(item)}
              >
                {renderItem(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RegistrationAutocompleteProps {
  form: AnyReactFormApi<EntryFormValues>;
  label: string;
  placeholder?: string;
  helperText?: string;
  onMatch: (item: RegistrationLookupItem) => void;
}

/**
 * Registration input backed by the server registration cache. Registration
 * codes are unique, so once a full, validly-formatted code resolves to
 * exactly one athlete, the sibling fields are filled in automatically
 * (no extra click required) — see `onMatch`.
 */
export function RegistrationAutocomplete({
  form,
  label,
  placeholder,
  helperText,
  onMatch,
}: RegistrationAutocompleteProps) {
  const { t } = useTranslation();
  const field = useField({ name: 'registration', form });
  const [isFocused, setIsFocused] = useState(false);
  const lastAppliedRef = useRef<string | null>(null);

  const value = String(field.state.value ?? '');
  const { data, isFetching } = useRegistrationLookup({ registration: value }, isFocused);

  useEffect(() => {
    const match = data?.length === 1 ? data[0] : undefined;
    if (match && lastAppliedRef.current !== match.registration) {
      lastAppliedRef.current = match.registration;
      onMatch(match);
    }
  }, [data, onMatch]);

  const showDropdown = isFocused && value.trim().length > 0 && (isFetching || !!data);

  return (
    <div className="relative">
      <InputWithHelper
        type="text"
        name="registration"
        label={label}
        placeholder={placeholder}
        helperText={helperText}
        autoCapitalize="characters"
        value={value}
        onChange={event => {
          field.handleChange(() => event.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          field.handleBlur();
          // Delay so a suggestion click can register before the list unmounts.
          setTimeout(() => setIsFocused(false), 150);
        }}
      />
      {showDropdown && (
        <SuggestionList
          items={data ?? []}
          isLoading={isFetching}
          getKey={item => item.externalId}
          loadingLabel={t('Pages.Event.Entries.Form.Autocomplete.Loading')}
          emptyLabel={t('Pages.Event.Entries.Form.Autocomplete.NoMatch')}
          onSelect={item => {
            lastAppliedRef.current = item.registration;
            onMatch(item);
            setIsFocused(false);
          }}
          renderItem={item => (
            <>
              <span className="font-medium">
                {item.firstname} {item.lastname}
              </span>
              {item.organisation && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {item.organisation}
                </span>
              )}
            </>
          )}
        />
      )}
    </div>
  );
}

interface ClubAutocompleteProps {
  form: AnyReactFormApi<EntryFormValues>;
  label: string;
}

/** Free-text club search backed by the server-cached ORIS club directory. */
export function ClubAutocomplete({ form, label }: ClubAutocompleteProps) {
  const { t } = useTranslation();
  const field = useField({ name: 'organisation', form });
  const [isFocused, setIsFocused] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const value = String(field.state.value ?? '');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(value), CLUB_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [value]);

  const shouldSearch = isFocused && debouncedQuery.trim().length >= CLUB_SEARCH_MIN_CHARS;
  const { data, isFetching } = useClubSearch(debouncedQuery, shouldSearch);

  const showDropdown = shouldSearch && (isFetching || !!data);

  return (
    <div className="relative">
      <InputWithHelper
        type="text"
        name="organisation"
        label={label}
        value={value}
        onChange={event => {
          field.handleChange(() => event.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          field.handleBlur();
          setTimeout(() => setIsFocused(false), 150);
        }}
      />
      {showDropdown && (
        <SuggestionList
          items={(data ?? []) as ClubListItem[]}
          isLoading={isFetching}
          getKey={item => item.externalId}
          loadingLabel={t('Pages.Event.Entries.Form.Autocomplete.Loading')}
          emptyLabel={t('Pages.Event.Entries.Form.Autocomplete.NoMatch')}
          onSelect={item => {
            field.handleChange(() => item.name);
            setIsFocused(false);
          }}
          renderItem={item => (
            <>
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {item.abbr}
              </span>
            </>
          )}
        />
      )}
    </div>
  );
}
