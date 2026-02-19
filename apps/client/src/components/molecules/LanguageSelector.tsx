import { Check, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Button, FlagIcon } from '../atoms';

type Language = {
  key: string;
  country: string;
  label: string;
  nativeName?: string;
};

const LANGUAGES: Language[] = [
  {
    key: 'cs',
    country: 'cz',
    label: 'Czech',
    nativeName: 'Čeština',
  },
  {
    key: 'en',
    country: 'gb',
    label: 'English',
    nativeName: 'English',
  },
  {
    key: 'de',
    country: 'de',
    label: 'German',
    nativeName: 'Deutsch',
  },
  {
    key: 'es',
    country: 'es',
    label: 'Spanish',
    nativeName: 'Español',
  },
  {
    key: 'sv',
    country: 'se',
    label: 'Swedish',
    nativeName: 'Svenska',
  },
];

export const LanguageSelector = () => {
  const { i18n, t } = useTranslation();

  // Fallback if no language is specified
  if (LANGUAGES.length === 0) {
    console.warn('No languages configured for LanguageSelector');
    return null;
  }

  const current = i18n.resolvedLanguage ?? i18n.language;

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
          variant="ghost"
          size="icon"
          className="w-9 h-9 relative group"
          title={t(
            'Molecules.LanguageSelector.SelectLanguage',
            'Select language'
          )}
        >
          <Languages className="h-4 w-4 transition-transform group-hover:scale-110" />
          <span className="sr-only">
            {t('Molecules.LanguageSelector.SelectLanguage', 'Select language')}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
        <DropdownMenuLabel className="flex items-center gap-2">
          <Languages className="h-4 w-4" />
          {t('Molecules.LanguageSelector.Title', 'Language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {LANGUAGES.map(lang => {
          const isSelected = current === lang.key;

          return (
            <DropdownMenuItem
              key={lang.key}
              onClick={() => handleChange(lang.key)}
              className={cn(
                'flex items-center gap-3 cursor-pointer py-2',
                isSelected && 'bg-accent'
              )}
            >
              {/* Flag and language info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FlagIcon
                  countryCode={lang.country}
                  size="sm"
                  className={cn(
                    'shrink-0 transition-transform',
                    isSelected && 'scale-110'
                  )}
                />

                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className={cn(
                      'text-sm font-medium truncate',
                      isSelected && 'text-primary font-semibold'
                    )}
                  >
                    {lang.label}
                  </span>
                  {lang.nativeName && (
                    <span className="text-xs text-muted-foreground truncate">
                      {lang.nativeName}
                    </span>
                  )}
                </div>
              </div>

              {/* Checkmark for selected language */}
              {isSelected && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSelector;
