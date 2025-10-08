import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button, FlagIcon } from '../atoms';

type Language = {
  key: string;
  country: string;
  name: string;
};

const LANGUAGES: Language[] = [
  { key: 'cs', country: 'cz', name: 'Česky' },
  { key: 'en', country: 'en', name: 'English' },
];

const DEFAULT_LANGUAGE: Language = LANGUAGES[0]!;

export function LanguageSelector() {
  const { i18n } = useTranslation();

  // Fallback pokud není žádný jazyk
  if (LANGUAGES.length === 0) {
    console.warn('No languages configured for LanguageSelector');
    return null;
  }

  const current = i18n.resolvedLanguage ?? i18n.language;

  const selected = React.useMemo(() => {
    return LANGUAGES.find(l => l.key === current) ?? DEFAULT_LANGUAGE;
  }, [current]);

  const handleChange = async (value: string) => {
    try {
      await i18n.changeLanguage(value);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Change language (current: ${selected.name})`}
          id={`lang-${selected.key}`}
          className="inline-flex items-center gap-2"
        >
          <FlagIcon countryCode={selected.country} className="text-xl" />
          <svg
            className="-mr-1 ml-1 h-4 w-4 opacity-70"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10.293 14.707a1 1 0 0 1-1.414 0l-4-4A1 1 0 0 1 6.293 9.293L10 13l3.707-3.707a1 1 0 0 1 1.414 1.414l-4 4Z"
              clipRule="evenodd"
            />
          </svg>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-40">
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={selected.key}
          onValueChange={handleChange}
        >
          {LANGUAGES.map(lang => (
            <DropdownMenuRadioItem
              key={lang.key}
              value={lang.key}
              className="flex items-center gap-2"
            >
              <FlagIcon countryCode={lang.country} className="shrink-0" />
              <span className="truncate">{lang.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSelector;
