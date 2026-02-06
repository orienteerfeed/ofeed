import { cn } from '@/lib/utils';
import { useField, useForm } from '@tanstack/react-form';
import { Loader2, Search, X } from 'lucide-react';
import React, { forwardRef, useEffect, useState } from 'react';
import { Badge, Button } from '../atoms';
import { InputWithHelper } from '../molecules';

// Types
interface Club {
  ID: string;
  Name: string;
  Abbr: string;
  Region?: string;
}

interface AutoCompleteFieldProps {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  maxSuggestions?: number;
  helperText?: string;
}

interface ApiResponse {
  Data: Record<string, Club>;
}

// Custom hook for fetching suggestions
const useClubSuggestions = (query: string, maxSuggestions: number = 10) => {
  const [suggestions, setSuggestions] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Simulate API delay for better UX
        await new Promise(resolve => setTimeout(resolve, 300));

        const response = await fetch(
          'https://oris.orientacnisporty.cz/API/?format=json&method=getCSOSClubList'
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ApiResponse = await response.json();
        const clubs = Object.values(data.Data);

        const filteredSuggestions = clubs
          .filter(
            club =>
              club.Name.toLowerCase().includes(query.toLowerCase()) ||
              club.Abbr.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, maxSuggestions);

        setSuggestions(filteredSuggestions);
      } catch (err) {
        console.error('Error fetching suggestions:', err);
        setError('Nepodařilo se načíst návrhy');
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, maxSuggestions]);

  return { suggestions, isLoading, error };
};

export const AutoCompleteField = forwardRef<
  HTMLInputElement,
  AutoCompleteFieldProps
>(
  (
    {
      name,
      label,
      placeholder = 'Začněte psát název klubu...',
      required = false,
      className,
      disabled = false,
      maxSuggestions = 10,
      helperText,
      ...props
    },
    ref
  ) => {
    const [localValue, setLocalValue] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [fieldError, setFieldError] = useState<string>('');

    const { suggestions, isLoading, error } = useClubSuggestions(
      localValue,
      maxSuggestions
    );

    // Správná typová definice pro TanStack Form
    const form = useForm();
    const field = useField({
      form,
      name,
      validators: {
        onChange: ({ value }: { value: unknown }) => {
          const stringValue = value as string;
          if (required && !stringValue) {
            return 'Toto pole je povinné';
          }
          return undefined;
        },
        onBlur: ({ value }: { value: unknown }) => {
          const stringValue = value as string;
          if (required && !stringValue) {
            return 'Toto pole je povinné';
          }
          return undefined;
        },
      },
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalValue(value);
      field.handleChange(value);
      setShowSuggestions(true);

      // Clear error when user starts typing
      if (fieldError) {
        setFieldError('');
      }
    };

    const handleSuggestionClick = (club: Club) => {
      const displayValue = `${club.Name} (${club.Abbr})`;
      setLocalValue(displayValue);
      field.handleChange(displayValue);
      setShowSuggestions(false);
      setFieldError('');
    };

    const handleClear = () => {
      setLocalValue('');
      field.handleChange('');
      setShowSuggestions(false);
      setFieldError('');
    };

    const handleBlur = () => {
      // Delay hiding suggestions to allow for clicks
      setTimeout(() => setShowSuggestions(false), 200);

      // Validate on blur
      const errors = field.state.meta.errors;
      if (errors.length > 0) {
        setFieldError(errors[0]?.toString() || '');
      }

      field.handleBlur();
    };

    const handleFocus = () => {
      if (localValue && suggestions.length > 0) {
        setShowSuggestions(true);
      }
      // Clear error when user focuses the field
      setFieldError('');
    };

    // Combine field errors and API errors
    const displayError = fieldError || error || undefined;
    const displayHelperText = !displayError ? helperText : undefined;

    // Safely convert field value to string for display
    const displayValue = field.state.value ? String(field.state.value) : '';

    return (
      <div className={cn('space-y-2', className)}>
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />

            <InputWithHelper
              ref={ref}
              id={name}
              name={name}
              value={localValue}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              placeholder={placeholder}
              disabled={disabled}
              {...(label && { label })}
              error={displayError}
              helperText={displayHelperText}
              required={required}
              className={cn(
                'pl-10 pr-10',
                displayError &&
                  'border-destructive focus-visible:ring-destructive'
              )}
              autoComplete="off"
              {...props}
            />

            {localValue && !disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent z-10"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Vymazat</span>
              </Button>
            )}
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && (isLoading || suggestions.length > 0) && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
              {isLoading && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">
                    Načítání...
                  </span>
                </div>
              )}

              {!isLoading && suggestions.length > 0 && (
                <ul className="py-1">
                  {suggestions.map(club => (
                    <li key={club.ID}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start h-auto py-2 px-3 text-left hover:bg-accent"
                        onClick={() => handleSuggestionClick(club)}
                      >
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">
                            {club.Name}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {club.Abbr}
                            </Badge>
                            {club.Region && (
                              <span className="text-xs text-muted-foreground">
                                {club.Region}
                              </span>
                            )}
                          </div>
                        </div>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Selected Value Display - only show when there's a value and no suggestions are shown */}
        {displayValue && !showSuggestions && (
          <div className="text-sm text-muted-foreground pt-1">
            Vybráno:{' '}
            <span className="font-medium text-foreground">{displayValue}</span>
          </div>
        )}
      </div>
    );
  }
);

AutoCompleteField.displayName = 'AutoCompleteField';

export default AutoCompleteField;
