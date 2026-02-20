import { ButtonWithSpinner } from '@/components/molecules';
import { Field, type AnyReactFormApi } from '@/components/organisms';
import { Input, Select } from '@/components/atoms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  formatStoredUtcTimeForInput,
  localTimeToUtcTimeForStorage,
  normalizeTimeInput,
} from '@/lib/date';
import { cn } from '@/lib/utils';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { format, toDate } from 'date-fns-tz';
import { TFunction } from 'i18next';
import { Download, Loader2, Search, Upload, X } from 'lucide-react';
import React, { useEffect } from 'react';
import { useApi } from '../../../hooks';
import { useRequest } from '../../../hooks/useRequest';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { PATHNAMES } from '../../../lib/paths/pathnames';
import {
  Country,
  EventFormData,
  EventFormValues,
  EventSport,
} from '../../../types';
import { toast } from '../../../utils/toast';

// GraphQL queries
const GET_SPORTS = gql`
  query SportsQuery {
    sports {
      id
      name
    }
  }
`;

const GET_COUNTRIES = gql`
  query CountriesQuery {
    countries {
      countryCode
      countryName
    }
  }
`;

interface EventFormProps {
  t: TFunction;
  initialData?: Partial<EventFormData> | null;
  showExternalImportSection?: boolean;
  renderSubmitButton?: (props: {
    isSubmitting: boolean;
    canSubmit: boolean;
  }) => React.ReactNode;
}

type ExternalProvider = 'ORIS' | 'EVENTOR';

type ExternalEventSearchItem = {
  provider: ExternalProvider;
  externalEventId: string;
  name: string;
  date?: string;
  organizer?: string;
  location?: string;
};

type ExternalEventSearchResponse = {
  data?: ExternalEventSearchItem[];
};

type ExternalEventPreviewDraft = {
  provider: ExternalProvider;
  externalEventId: string;
  name: string;
  sportId?: number;
  date?: string;
  timezone?: string;
  organizer?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  zeroTime?: string;
  ranking?: boolean;
  coefRanking?: number;
  relay?: boolean;
  published?: boolean;
  hundredthPrecision?: boolean;
};

type ExternalEventPreviewResponse = {
  data?: ExternalEventPreviewDraft;
};

const normalizeDateInputValue = (value?: string): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim();
  const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];

  const parsedDate = new Date(trimmed);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return undefined;
};

// Helper function to convert EventFormData to EventFormValues
const convertToFormValues = (
  event: Partial<EventFormData>,
  fallbackTimezone: string
): EventFormValues => ({
  eventName: event.name || '',
  sportId: event.sportId?.toString() || '',
  date: event.date || '',
  timezone: event.timezone || 'Europe/Prague',
  organizer: event.organizer || '',
  location: event.location || '',
  latitude: event.latitude?.toString() || '',
  longitude: event.longitude?.toString() || '',
  countryCode: event.countryCode || '',
  zeroTime:
    event.zeroTime && event.date
      ? formatStoredUtcTimeForInput(
          event.zeroTime,
          event.date,
          event.timezone || fallbackTimezone
        )
      : event.zeroTime || '',
  ranking: event.ranking || false,
  coefRanking: event.coefRanking?.toString() || '',
  relay: event.relay || false,
  published: event.published || false,
  hundredthPrecision: event.hundredthPrecision || false,
});

// ReactiveField wrapper component
interface ReactiveFieldProps {
  form: AnyReactFormApi<EventFormValues>;
  name: string;
  type?: string;
  validate?: (value: string) => string | undefined;
  placeholder?: string;
  className?: string;
  options?: Array<{ value: string; label: string }>;
  step?: string;
  disabled?: boolean; // ← přidejte disabled prop
}

const ReactiveField: React.FC<ReactiveFieldProps> = ({
  form,
  disabled: externalDisabled,
  ...props
}) => {
  return (
    <form.Subscribe
      selector={(state: { isSubmitting: boolean }) => state.isSubmitting}
    >
      {(isSubmitting: boolean) => (
        <Field
          form={form}
          disabled={externalDisabled || (isSubmitting ?? false)}
          {...props}
        />
      )}
    </form.Subscribe>
  );
};

export const EventForm: React.FC<EventFormProps> = ({
  t,
  initialData = null,
  showExternalImportSection = true,
  renderSubmitButton,
}) => {
  const navigate = useNavigate();
  const { post } = useApi();
  const request = useRequest();
  const imageRequest = useRequest();
  const isCreateMode = !initialData?.id;
  const userTimezone = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );
  const initialExternalSource = initialData?.externalSource ?? null;
  const initialExternalEventId = initialData?.externalEventId ?? null;
  const apiPostRef = React.useRef(post);

  const [featuredImage, setFeaturedImage] = React.useState<File | null>(null);
  const [isDraggingImage, setIsDraggingImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [externalProvider, setExternalProvider] = React.useState<ExternalProvider>(
    initialExternalSource ?? 'ORIS'
  );
  const [externalEventId, setExternalEventId] = React.useState(
    initialExternalEventId ?? ''
  );
  const [externalApiKey, setExternalApiKey] = React.useState('');
  const [externalSearchQuery, setExternalSearchQuery] = React.useState('');
  const [externalSearchResults, setExternalSearchResults] = React.useState<
    ExternalEventSearchItem[]
  >([]);
  const [isSearchingExternal, setIsSearchingExternal] = React.useState(false);
  const [isLoadingExternalPreview, setIsLoadingExternalPreview] =
    React.useState(false);
  const [showExternalSearchResults, setShowExternalSearchResults] =
    React.useState(false);
  const [isImportPanelOpen, setIsImportPanelOpen] = React.useState(false);
  const [isExternalLinkCleared, setIsExternalLinkCleared] =
    React.useState(false);
  const [importedExternalSource, setImportedExternalSource] =
    React.useState<ExternalProvider | null>(initialExternalSource);
  const [importedExternalEventId, setImportedExternalEventId] =
    React.useState<string | null>(initialExternalEventId);
  const latestSearchIdRef = React.useRef(0);
  const externalSearchTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const isEventorProvider = externalProvider === 'EVENTOR';
  const hasSelectedExternalLink = Boolean(
    importedExternalSource && importedExternalEventId
  );
  const effectiveExternalSource = isExternalLinkCleared
    ? null
    : importedExternalSource;
  const effectiveExternalEventId = isExternalLinkCleared
    ? null
    : importedExternalEventId;
  const hasEffectiveExternalLink = Boolean(
    effectiveExternalSource && effectiveExternalEventId
  );

  const maxFeaturedImageSize = 2 * 1024 * 1024;
  const allowedFeaturedImageTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  const featuredImagePreview = React.useMemo(() => {
    if (!featuredImage) return null;
    return URL.createObjectURL(featuredImage);
  }, [featuredImage]);

  const clearExternalSearchTimeout = React.useCallback(() => {
    if (externalSearchTimeoutRef.current !== null) {
      clearTimeout(externalSearchTimeoutRef.current);
      externalSearchTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (featuredImagePreview) {
        URL.revokeObjectURL(featuredImagePreview);
      }
    };
  }, [featuredImagePreview]);

  useEffect(() => {
    apiPostRef.current = post;
  }, [post]);

  useEffect(() => {
    setExternalSearchResults([]);
    setShowExternalSearchResults(false);
    setIsSearchingExternal(false);
    clearExternalSearchTimeout();
  }, [clearExternalSearchTimeout, externalProvider]);

  useEffect(() => {
    if (isImportPanelOpen) return;
    clearExternalSearchTimeout();
    setIsSearchingExternal(false);
    setShowExternalSearchResults(false);
  }, [clearExternalSearchTimeout, isImportPanelOpen]);

  const runExternalSearch = React.useCallback(
    async (rawQuery: string, source: 'auto' | 'manual' = 'auto') => {
      const query = rawQuery.trim();

      if (query.length < 2) {
        setExternalSearchResults([]);
        setShowExternalSearchResults(false);
        return;
      }

      if (isEventorProvider && !externalApiKey.trim()) {
        setExternalSearchResults([]);
        setShowExternalSearchResults(false);
        if (source === 'manual') {
          toast({
            title: t('Operations.Error', { ns: 'common' }),
            description: t(
              'Pages.Event.Form.Import.Toast.EventorApiKeyRequired',
              'Eventor API key is required for Eventor provider.'
            ),
            variant: 'error',
          });
        }
        return;
      }

      const searchId = latestSearchIdRef.current + 1;
      latestSearchIdRef.current = searchId;
      setIsSearchingExternal(true);

      try {
        const payload = await apiPostRef.current<ExternalEventSearchResponse>(
          ENDPOINTS.searchExternalEvents(),
          {
            provider: externalProvider,
            query,
            apiKey: isEventorProvider ? externalApiKey.trim() || undefined : undefined,
            limit: 8,
          }
        );

        if (latestSearchIdRef.current !== searchId) {
          return;
        }

        setExternalSearchResults(payload?.data ?? []);
        setShowExternalSearchResults(true);
      } catch (error) {
        if (latestSearchIdRef.current !== searchId) {
          return;
        }

        setExternalSearchResults([]);
        setShowExternalSearchResults(false);

        if (source === 'manual') {
          toast({
            title: t('Pages.Event.Form.Import.Toast.SearchFailedTitle', {
              defaultValue: 'Search failed',
            }),
            description:
              error instanceof Error
                ? error.message
                : t(
                    'Pages.Event.Form.Import.Toast.SearchFailedDescription',
                    'Unable to search events in external provider.'
                  ),
            variant: 'error',
          });
        }
      } finally {
        if (latestSearchIdRef.current === searchId) {
          setIsSearchingExternal(false);
        }
      }
    },
    [externalApiKey, externalProvider, isEventorProvider, t]
  );

  useEffect(() => {
    return () => {
      clearExternalSearchTimeout();
    };
  }, [clearExternalSearchTimeout]);

  const scheduleExternalSearch = React.useCallback(
    (rawQuery: string) => {
      clearExternalSearchTimeout();

      const query = rawQuery.trim();
      if (!isImportPanelOpen) {
        return;
      }

      if (query.length < 2) {
        setExternalSearchResults([]);
        setShowExternalSearchResults(false);
        setIsSearchingExternal(false);
        return;
      }

      externalSearchTimeoutRef.current = setTimeout(() => {
        void runExternalSearch(query, 'auto');
      }, 350);
    },
    [clearExternalSearchTimeout, isImportPanelOpen, runExternalSearch]
  );

  useEffect(() => {
    if (!isImportPanelOpen || !showExternalSearchResults) {
      return;
    }

    const query = externalSearchQuery.trim();
    if (query.length < 2) return;

    scheduleExternalSearch(query);
  }, [
    externalApiKey,
    externalProvider,
    externalSearchQuery,
    isImportPanelOpen,
    scheduleExternalSearch,
    showExternalSearchResults,
  ]);

  const validateFeaturedImage = (file: File): boolean => {
    if (!allowedFeaturedImageTypes.has(file.type)) {
      toast({
        title: t('Organisms.DragDrop.Toast.InvalidFormat'),
        description: `${t('Organisms.DragDrop.Toast.AllowedFormats', {
          formats: 'JPG, JPEG, PNG, WEBP',
        })}`,
        variant: 'error',
      });
      return false;
    }

    if (file.size > maxFeaturedImageSize) {
      toast({
        title: t('Organisms.DragDrop.Toast.FileTooLarge'),
        description: t('Organisms.DragDrop.Toast.MaxSize', { size: 2 }),
        variant: 'error',
      });
      return false;
    }

    return true;
  };

  const handleFeaturedImageSelect = (file: File) => {
    if (!validateFeaturedImage(file)) return;
    setFeaturedImage(file);
  };

  const handleFeaturedImageInput: React.ChangeEventHandler<HTMLInputElement> = e => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    handleFeaturedImageSelect(file);
    e.currentTarget.value = '';
  };

  const handleFeaturedImageDrop: React.DragEventHandler<HTMLDivElement> = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) handleFeaturedImageSelect(file);
  };

  const handleFeaturedImageDragOver: React.DragEventHandler<HTMLDivElement> = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(true);
  };

  const handleFeaturedImageDragLeave: React.DragEventHandler<HTMLDivElement> = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
  };

  const handleFeaturedImageRemove = () => {
    setFeaturedImage(null);
  };

  // Fetch sports data using Apollo Client
  const {
    data: sportsData,
    loading: sportsLoading,
    error: sportsError,
  } = useQuery<{ sports: EventSport[] }>(GET_SPORTS);

  // Fetch countries data using Apollo Client
  const {
    data: countriesData,
    loading: countriesLoading,
    error: countriesError,
  } = useQuery<{ countries: Country[] }>(GET_COUNTRIES);

  useEffect(() => {
    if (sportsError) {
      console.error('Failed to load sports:', sportsError);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: 'Failed to load sports data',
        variant: 'error',
      });
    }
  }, [sportsError, t]);

  useEffect(() => {
    if (countriesError) {
      console.error('Failed to load countries:', countriesError);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: 'Failed to load countries data',
        variant: 'error',
      });
    }
  }, [countriesError, t]);

  // Generate timezone options
  const timezones = Intl.supportedValuesOf('timeZone').map(tz => ({
    value: tz,
    label: `${tz} (UTC ${format(toDate(new Date(), { timeZone: tz }), 'XXX')})`,
  }));

  // Validation functions
  const validateEventName = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Event name is required');
    }
    if (value.length < 2) {
      return t(
        'validation.minLength',
        'Event name must be at least 2 characters'
      );
    }
    return undefined;
  };

  const validateSport = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Sport is required');
    }
    return undefined;
  };

  const validateCountry = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Country is required');
    }
    return undefined;
  };

  const validateDate = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Date is required');
    }
    return undefined;
  };

  const validateTimezone = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Timezone is required');
    }
    return undefined;
  };

  const validateOrganizer = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Organizer is required');
    }
    return undefined;
  };

  const validateLocation = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Location is required');
    }
    return undefined;
  };

  const validateLatitude = (value: string): string | undefined => {
    if (value && (parseFloat(value) < -90 || parseFloat(value) > 90)) {
      return t('validation.latitude', 'Latitude must be between -90 and 90');
    }
    return undefined;
  };

  const validateLongitude = (value: string): string | undefined => {
    if (value && (parseFloat(value) < -180 || parseFloat(value) > 180)) {
      return t(
        'validation.longitude',
        'Longitude must be between -180 and 180'
      );
    }
    return undefined;
  };

  const validateZeroTime = (value: string): string | undefined => {
    if (!value) {
      return t('validation.required', 'Zero time is required');
    }

    if (!normalizeTimeInput(value)) {
      return t('validation.time', 'Time must be in HH:mm or HH:mm:ss format');
    }

    return undefined;
  };

  const form = useForm({
    defaultValues: initialData
      ? convertToFormValues(initialData, userTimezone)
      : {
          eventName: '',
          sportId: '',
          date: '',
          timezone: 'Europe/Prague',
          organizer: '',
          location: '',
          latitude: '',
          longitude: '',
          countryCode: '',
          zeroTime: '',
          ranking: false,
          coefRanking: '',
          relay: false,
          published: false,
          hundredthPrecision: false,
        },
    validators: {
      onChange: ({ value }) => {
        const errors: Partial<Record<keyof EventFormValues, string>> = {};

        // Basic validations
        const eventNameError = validateEventName(value.eventName);
        if (eventNameError) errors.eventName = eventNameError;

        const sportError = validateSport(value.sportId);
        if (sportError) errors.sportId = sportError;

        const dateError = validateDate(value.date);
        if (dateError) errors.date = dateError;

        const timezoneError = validateTimezone(value.timezone);
        if (timezoneError) errors.timezone = timezoneError;

        const organizerError = validateOrganizer(value.organizer);
        if (organizerError) errors.organizer = organizerError;

        const locationError = validateLocation(value.location);
        if (locationError) errors.location = locationError;

        const latitudeError = validateLatitude(value.latitude);
        if (latitudeError) errors.latitude = latitudeError;

        const longitudeError = validateLongitude(value.longitude);
        if (longitudeError) errors.longitude = longitudeError;

        const zeroTimeError = validateZeroTime(value.zeroTime);
        if (zeroTimeError) errors.zeroTime = zeroTimeError;

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      const method = initialData?.id ? 'PUT' : 'POST';
      const url = initialData?.id
        ? ENDPOINTS.eventDetail(initialData.id)
        : ENDPOINTS.events();
      const externalSourcePayload = isExternalLinkCleared
        ? null
        : hasSelectedExternalLink
          ? effectiveExternalSource
          : undefined;
      const externalEventIdPayload = isExternalLinkCleared
        ? null
        : hasSelectedExternalLink
          ? effectiveExternalEventId
          : undefined;
      const normalizedZeroTime = localTimeToUtcTimeForStorage(
        value.zeroTime,
        value.date,
        value.timezone || userTimezone
      );

      let savedEventId: string | undefined;

      if (!normalizedZeroTime) {
        toast({
          title: t('Operations.Error', { ns: 'common' }),
          description: t(
            'Pages.Event.Form.Toast.InvalidZeroTime',
            'Unable to parse start time. Use HH:mm or HH:mm:ss format.'
          ),
          variant: 'error',
        });
        return;
      }

      try {
        await request.request(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: value.eventName,
            sportId: value.sportId ? parseInt(value.sportId, 10) : undefined,
            organizer: value.organizer,
            date: value.date,
            timezone: value.timezone,
            location: value.location,
            latitude: value.latitude ? parseFloat(value.latitude) : undefined,
            longitude: value.longitude
              ? parseFloat(value.longitude)
              : undefined,
            countryCode: value.countryCode || undefined,
            zeroTime: normalizedZeroTime,
            ranking: value.ranking,
            coefRanking: value.coefRanking
              ? parseFloat(value.coefRanking)
              : undefined,
            relay: value.relay,
            published: value.published,
            hundredthPrecision: value.hundredthPrecision,
            externalSource: externalSourcePayload,
            externalEventId: externalEventIdPayload,
          }),
          onSuccess: (response: unknown) => {
            toast({
              title: t('Operations.Success', { ns: 'common' }),
              description: initialData?.id
                ? t('Pages.Event.Form.Toast.EditSuccess')
                : t('Pages.Event.Form.Toast.CreateSuccess'),
              variant: 'default',
            });

            const responseData = response as
              | {
                  results?: { data?: { id?: string } };
                  data?: { id?: string };
                }
              | null;
            savedEventId =
              responseData?.results?.data?.id ?? responseData?.data?.id;
          },
          onError: (err: unknown) => {
            console.error('Form submission error:', err);

            if (
              typeof err === 'object' &&
              err !== null &&
              'errors' in err &&
              Array.isArray((err as { errors?: unknown[] }).errors)
            ) {
              (err as { errors: Array<{ param?: string; msg?: string }> }).errors.forEach(
                error => {
                toast({
                  title: 'Validation Error',
                  description: `${error.param}: ${error.msg}`,
                  variant: 'error',
                });
                }
              );
            } else {
              toast({
                title: t('Operations.Error', { ns: 'common' }),
                description:
                  err instanceof Error
                    ? err.message
                    : 'Failed to save event',
                variant: 'error',
              });
            }
          },
        });

        const uploadTargetId = savedEventId ?? initialData?.id;

        if (uploadTargetId && featuredImage) {
          const formData = new FormData();
          formData.append('file', featuredImage);

          await imageRequest.request(ENDPOINTS.uploadEventImage(uploadTargetId), {
            method: 'POST',
            body: formData,
            onSuccess: () => {
              toast({
                title: t('Operations.Success', { ns: 'common' }),
                description: t('Pages.Event.Form.Toast.FeaturedImageUploadSuccess'),
                variant: 'default',
              });
              setFeaturedImage(null);
            },
            onError: () => {
              toast({
                title: t('Operations.Error', { ns: 'common' }),
                description: t('Pages.Event.Form.Toast.FeaturedImageUploadError'),
                variant: 'error',
              });
            },
          });
        }

        if (savedEventId && !initialData?.id) {
          navigate({
            ...PATHNAMES.eventSettings(savedEventId),
          });
        }
      } catch (error) {
        console.error('Form submission error:', error);
        toast({
          title: t('Operations.Error', { ns: 'common' }),
          description: 'Network error occurred',
          variant: 'error',
        });
      }
    },
  });

  const applyImportedDraft = (draft: ExternalEventPreviewDraft) => {
    if (draft.name) {
      form.setFieldValue('eventName', draft.name);
    }

    if (draft.sportId) {
      form.setFieldValue('sportId', String(draft.sportId));
    }

    const normalizedDate = normalizeDateInputValue(draft.date);
    if (normalizedDate) {
      form.setFieldValue('date', normalizedDate);
    }

    if (draft.timezone) {
      form.setFieldValue('timezone', draft.timezone);
    }

    if (draft.organizer) {
      form.setFieldValue('organizer', draft.organizer);
    }

    if (draft.location) {
      form.setFieldValue('location', draft.location);
    }

    if (draft.latitude !== undefined) {
      form.setFieldValue('latitude', String(draft.latitude));
    }

    if (draft.longitude !== undefined) {
      form.setFieldValue('longitude', String(draft.longitude));
    }

    if (draft.countryCode) {
      form.setFieldValue('countryCode', draft.countryCode.toUpperCase());
    }

    const normalizedZeroTime =
      normalizeTimeInput(draft.zeroTime) ??
      (normalizedDate ? '00:00:00' : undefined);
    if (normalizedZeroTime) {
      form.setFieldValue('zeroTime', normalizedZeroTime);
    }

    if (typeof draft.ranking === 'boolean') {
      form.setFieldValue('ranking', draft.ranking);
    }

    if (draft.coefRanking !== undefined && draft.coefRanking !== null) {
      form.setFieldValue('coefRanking', String(draft.coefRanking));
    }

    if (typeof draft.relay === 'boolean') {
      form.setFieldValue('relay', draft.relay);
    }

    if (typeof draft.published === 'boolean') {
      form.setFieldValue('published', draft.published);
    }

    if (typeof draft.hundredthPrecision === 'boolean') {
      form.setFieldValue('hundredthPrecision', draft.hundredthPrecision);
    }
  };

  const handleExternalPreviewLoad = async (externalIdOverride?: string) => {
    const trimmedId = (externalIdOverride ?? externalEventId).trim();
    if (!trimmedId) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Event.Form.Import.Toast.ExternalIdRequired',
          'External event ID is required.'
        ),
        variant: 'error',
      });
      return;
    }

    if (isEventorProvider && !externalApiKey.trim()) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Event.Form.Import.Toast.EventorApiKeyRequired',
          'Eventor API key is required for Eventor provider.'
        ),
        variant: 'error',
      });
      return;
    }

    setIsLoadingExternalPreview(true);

    try {
      const payload = await apiPostRef.current<ExternalEventPreviewResponse>(
        ENDPOINTS.importEventPreview(),
        {
          provider: externalProvider,
          externalEventId: trimmedId,
          apiKey: isEventorProvider ? externalApiKey.trim() || undefined : undefined,
        }
      );

      if (!payload?.data) {
        toast({
          title: t('Operations.Error', { ns: 'common' }),
          description: t(
            'Pages.Event.Form.Import.Toast.InvalidResponse',
            'Unable to process imported event data.'
          ),
          variant: 'error',
        });
        return;
      }

      applyImportedDraft(payload.data);
      setImportedExternalSource(payload.data.provider ?? externalProvider);
      setImportedExternalEventId(payload.data.externalEventId ?? trimmedId);
      setIsExternalLinkCleared(false);

      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t(
          'Pages.Event.Form.Import.Toast.PrefillSuccess',
          'Event form has been prefilled from external system.'
        ),
      });
    } catch (error) {
      toast({
        title: t('Pages.Event.Form.Import.Toast.PrefillFailedTitle', {
          defaultValue: 'Import failed',
        }),
        description:
          error instanceof Error
            ? error.message
            : t(
                'Pages.Event.Form.Import.Toast.PrefillFailedDescription',
                'Unable to load event data from external provider.'
              ),
        variant: 'error',
      });
    } finally {
      setIsLoadingExternalPreview(false);
    }
  };

  const handleSearchResultSelect = (item: ExternalEventSearchItem) => {
    const selectedExternalEventId = item.externalEventId;
    clearExternalSearchTimeout();
    latestSearchIdRef.current += 1;
    setIsSearchingExternal(false);
    setExternalEventId(selectedExternalEventId);
    setExternalSearchQuery(item.name);
    setShowExternalSearchResults(false);
    setImportedExternalSource(null);
    setImportedExternalEventId(null);
    void handleExternalPreviewLoad(selectedExternalEventId);
  };

  const handleClearExternalLink = () => {
    setIsExternalLinkCleared(true);
    setImportedExternalSource(null);
    setImportedExternalEventId(null);
    setExternalSearchResults([]);
    setShowExternalSearchResults(false);
    setExternalSearchQuery('');
    setExternalEventId('');
    toast({
      title: t('Operations.Success', { ns: 'common' }),
      description: t(
        'Pages.Event.Form.Import.Toast.LinkRemovedPendingSave',
        'External event link will be removed after saving the event.'
      ),
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log(
      'Form submission started, isSubmitting:',
      form.state.isSubmitting
    );

    try {
      const submissionPromise = form.handleSubmit();

      if (submissionPromise) {
        await submissionPromise;
        console.log('Form submission completed successfully');
      } else {
        console.log('No submission promise returned');
      }
    } catch (error) {
      console.error('Form submission error caught:', error);
    } finally {
      console.log(
        'Form submission finally block, isSubmitting:',
        form.state.isSubmitting
      );
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      {showExternalImportSection && (
      <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {t('Pages.Event.Form.Import.Title', 'Import from external IS')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                'Pages.Event.Form.Import.Description',
                'Search event by name or load by external event ID and prefill this form.'
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsImportPanelOpen(current => !current)}
          >
            {isImportPanelOpen
              ? t('Pages.Event.Form.Import.Hide', 'Hide import')
              : t(
                  'Pages.Event.Form.Import.Open',
                  'Import from external IS'
                )}
          </Button>
        </div>

        {!isCreateMode && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {hasEffectiveExternalLink ? (
                <>
                  {t('Pages.Event.Form.Import.CurrentLink', 'Current link')}:{' '}
                  <span className="font-medium text-foreground">
                    {`${effectiveExternalSource} • ${effectiveExternalEventId}`}
                  </span>
                </>
              ) : (
                t(
                  'Pages.Event.Form.Import.NoLink',
                  'This event is not linked to any external system.'
                )
              )}
            </p>
            {hasEffectiveExternalLink && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearExternalLink}
              >
                {t('Pages.Event.Form.Import.Unlink', 'Remove link')}
              </Button>
            )}
          </div>
        )}

        {isImportPanelOpen && (
          <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t('Pages.Event.Form.Import.Provider', 'Provider')}
                  </Label>
                  <Select
                    value={externalProvider}
                    onValueChange={value => {
                      setExternalProvider(value as ExternalProvider)
                      setImportedExternalSource(null);
                      setImportedExternalEventId(null);
                    }}
                    options={[
                      {
                        value: 'ORIS',
                        label: t('Pages.Event.Form.Import.Providers.ORIS', 'ORIS'),
                      },
                      {
                        value: 'EVENTOR',
                        label: t(
                          'Pages.Event.Form.Import.Providers.EVENTOR',
                          'Eventor'
                        ),
                      },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t(
                      'Pages.Event.Form.Import.ExternalEventId',
                      'External event ID'
                    )}
                  </Label>
                  <Input
                    value={externalEventId}
                    onChange={e => {
                      setExternalEventId(e.target.value);
                      setImportedExternalSource(null);
                      setImportedExternalEventId(null);
                      setIsExternalLinkCleared(false);
                    }}
                    placeholder={t(
                      'Pages.Event.Form.Import.Placeholders.ExternalEventId',
                      'e.g. 8300'
                    )}
                  />
                </div>
              </div>

              {isEventorProvider && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t('Pages.Event.Form.Import.ApiKey', 'Eventor API key')}
                  </Label>
                  <Input
                    value={externalApiKey}
                    onChange={e => setExternalApiKey(e.target.value)}
                    type="password"
                    placeholder={t(
                      'Pages.Event.Form.Import.Placeholders.ApiKey',
                      'Enter Eventor API key'
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Pages.Event.Form.Import.ApiKeyHelper',
                      'API key is required for Eventor import and search.'
                    )}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t(
                    'Pages.Event.Form.Import.SearchByName',
                    'Search external events by name'
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={externalSearchQuery}
                      onChange={e => {
                        const query = e.target.value;
                        setExternalSearchQuery(query);
                        setShowExternalSearchResults(true);
                        scheduleExternalSearch(query);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void runExternalSearch(externalSearchQuery, 'manual');
                        }
                      }}
                      placeholder={t(
                        'Pages.Event.Form.Import.Placeholders.SearchByName',
                        'Type at least 2 characters...'
                      )}
                      className="pl-9"
                      disabled={isEventorProvider && !externalApiKey.trim()}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      isSearchingExternal ||
                      externalSearchQuery.trim().length < 2 ||
                      (isEventorProvider && !externalApiKey.trim())
                    }
                    onClick={() =>
                      void runExternalSearch(externalSearchQuery, 'manual')
                    }
                  >
                    {isSearchingExternal ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {externalSearchQuery.trim().length < 2 ? (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Pages.Event.Form.Import.MinCharacters',
                      'Enter at least 2 characters to search.'
                    )}
                  </p>
                ) : null}
              </div>

              {showExternalSearchResults &&
              (isSearchingExternal || externalSearchResults.length > 0) ? (
                <div className="space-y-2 rounded-md border border-border bg-background p-2">
                  {isSearchingExternal ? (
                    <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('Pages.Event.Form.Import.Searching', 'Searching...')}
                    </div>
                  ) : (
                    externalSearchResults.map(item => (
                      <button
                        key={`${item.provider}-${item.externalEventId}`}
                        type="button"
                        onClick={() => handleSearchResultSelect(item)}
                        className="w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/50"
                      >
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {`${item.externalEventId}${
                            item.date ? ` • ${item.date}` : ''
                          }${item.location ? ` • ${item.location}` : ''}`}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {showExternalSearchResults &&
              !isSearchingExternal &&
              externalSearchQuery.trim().length >= 2 &&
              externalSearchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Pages.Event.Form.Import.NoResults',
                    'No matching events found.'
                  )}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void handleExternalPreviewLoad()}
                  disabled={
                    isLoadingExternalPreview ||
                    !externalEventId.trim() ||
                    (isEventorProvider && !externalApiKey.trim())
                  }
                >
                  {isLoadingExternalPreview ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {t(
                    'Pages.Event.Form.Import.LoadPreview',
                    'Load and prefill form'
                  )}
                </Button>
              </div>
            </>
          )}
      </div>
      )}

      {/* Základní informace - 2 sloupce */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Event Name - plná šířka na mobile, 2 sloupce na desktopu */}
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="eventName" className="text-sm font-medium">
            {t('Pages.Event.Form.EventName')}
          </Label>
          <ReactiveField
            form={form}
            name="eventName"
            type="text"
            placeholder={t('Pages.Event.Form.Placeholders.EventName')}
            validate={validateEventName}
            className="w-full"
          />
        </div>

        {/* Featured Image */}
        <div className="md:col-span-2 space-y-2">
          <Label className="text-sm font-medium">
            {t('Pages.Event.Form.FeaturedImage')}
          </Label>

          <div
            onDrop={handleFeaturedImageDrop}
            onDragOver={handleFeaturedImageDragOver}
            onDragLeave={handleFeaturedImageDragLeave}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
              isDraggingImage
                ? 'border-primary bg-primary/5'
                : 'border-border bg-muted/20'
            )}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {t('Pages.Event.Form.FeaturedImageHint')}
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              {t('Pages.Event.Form.FeaturedImageButton')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFeaturedImageInput}
            />
          </div>

          {featuredImage && (
            <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
              {featuredImagePreview ? (
                <img
                  src={featuredImagePreview}
                  alt={featuredImage.name}
                  className="h-16 w-16 rounded-md object-cover"
                />
              ) : null}
              <div className="flex-1">
                <div className="text-sm font-medium">{featuredImage.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(featuredImage.size / 1024).toFixed(0)} KB
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleFeaturedImageRemove}
                aria-label={t('Pages.Event.Form.FeaturedImageRemove')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Sport Selection - plná šířka na mobile, 2 sloupce na desktopu */}
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="sportId" className="text-sm font-medium">
            {t('Pages.Event.Form.Sport')}
          </Label>
          <ReactiveField
            form={form}
            name="sportId"
            type="select"
            placeholder={t('Pages.Event.Form.Placeholders.Sport')}
            disabled={sportsLoading} // Only disable for sports loading, not form submission
            validate={validateSport}
            className="w-full"
            options={
              sportsData?.sports?.map(sport => ({
                value: sport.id.toString(),
                label: sport.name,
              })) || []
            }
          />
        </div>

        {/* Date and Timezone */}
        <div className="space-y-2">
          <Label htmlFor="date" className="text-sm font-medium">
            {t('Pages.Event.Form.Date')}
          </Label>
          <ReactiveField
            form={form}
            name="date"
            type="date"
            validate={validateDate}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="timezone" className="text-sm font-medium">
            {t('Pages.Event.Form.Timezone')}
          </Label>
          <ReactiveField
            form={form}
            name="timezone"
            type="select"
            placeholder={t('Pages.Event.Form.Placeholders.Timezone')}
            validate={validateTimezone}
            className="w-full"
            options={timezones}
          />
        </div>
      </div>

      {/* Organizace a lokace - 2 sloupce */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="organizer" className="text-sm font-medium">
            {t('Pages.Event.Form.Organizer')}
          </Label>
          <ReactiveField
            form={form}
            name="organizer"
            type="text"
            placeholder={t('Pages.Event.Form.Placeholders.Organizer')}
            validate={validateOrganizer}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location" className="text-sm font-medium">
            {t('Pages.Event.Form.Location')}
          </Label>
          <ReactiveField
            form={form}
            name="location"
            type="text"
            placeholder={t('Pages.Event.Form.Placeholders.Location')}
            validate={validateLocation}
            className="w-full"
          />
        </div>
      </div>

      {/* GPS souřadnice - 2 sloupce */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="latitude" className="text-sm font-medium">
            {t('Pages.Event.Form.Latitude')}
          </Label>
          <ReactiveField
            form={form}
            name="latitude"
            type="number"
            step="0.000001"
            placeholder={t('Pages.Event.Form.Placeholders.Latitude')}
            validate={validateLatitude}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="longitude" className="text-sm font-medium">
            {t('Pages.Event.Form.Longitude')}
          </Label>
          <ReactiveField
            form={form}
            name="longitude"
            type="number"
            step="0.000001"
            placeholder={t('Pages.Event.Form.Placeholders.Longitude')}
            validate={validateLongitude}
            className="w-full"
          />
        </div>
      </div>

      {/* Země a Zero Time - 2 sloupce */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="countryCode" className="text-sm font-medium">
            {t('Pages.Event.Form.Country')}
          </Label>
          <ReactiveField
            form={form}
            name="countryCode"
            type="select"
            placeholder={t('Pages.Event.Form.Placeholders.Country')}
            disabled={countriesLoading} // Only disable for countries loading, not form submission
            className="w-full"
            options={
              countriesData?.countries?.map(country => ({
                value: country.countryCode,
                label: country.countryName,
              })) || []
            }
            validate={validateCountry}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zeroTime" className="text-sm font-medium">
            {t('Pages.Event.Form.ZeroTime')}
          </Label>
          <ReactiveField
            form={form}
            name="zeroTime"
            type="time"
            step="1"
            validate={validateZeroTime}
            className="w-full"
          />
        </div>
      </div>

      {/* Nastavení eventu - 2 sloupce s checkboxy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Levý sloupec - Ranking a Coef Ranking */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <ReactiveField
              form={form}
              name="ranking"
              type="checkbox"
              className="h-4 w-4"
            />
            <Label htmlFor="ranking" className="text-sm font-medium">
              {t('Pages.Event.Form.Ranking')}
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coefRanking" className="text-sm font-medium">
              {t('Pages.Event.Form.CoefRanking')}
            </Label>
            <ReactiveField
              form={form}
              name="coefRanking"
              type="number"
              step="0.01"
              placeholder={t('Pages.Event.Form.Placeholders.CoefRanking')}
              className="w-full"
            />
          </div>
        </div>

        {/* Pravý sloupec - Ostatní checkboxy */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <ReactiveField
              form={form}
              name="relay"
              type="checkbox"
              className="h-4 w-4"
            />
            <Label htmlFor="relay" className="text-sm font-medium">
              {t('Pages.Event.Form.Relay')}
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <ReactiveField
              form={form}
              name="hundredthPrecision"
              type="checkbox"
              className="h-4 w-4"
            />
            <Label htmlFor="hundredthPrecision" className="text-sm font-medium">
              {t('Pages.Event.Form.HundredthPrecision')}
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <ReactiveField
              form={form}
              name="published"
              type="checkbox"
              className="h-4 w-4"
            />
            <Label htmlFor="published" className="text-sm font-medium">
              {t('Pages.Event.Form.Published')}
            </Label>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4">
        {!renderSubmitButton ? (
          <form.Subscribe
            selector={state => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <ButtonWithSpinner
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
                isSubmitting={isSubmitting}
                size="lg"
              >
                {isSubmitting
                  ? t('Operations.Submitting', { ns: 'common' })
                  : initialData?.id
                    ? t('Operations.Update', { ns: 'common' })
                    : t('Operations.Create', { ns: 'common' })}
              </ButtonWithSpinner>
            )}
          </form.Subscribe>
        ) : (
          <form.Subscribe
            selector={state => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) =>
              renderSubmitButton({
                isSubmitting: isSubmitting ?? false,
                canSubmit: canSubmit ?? false,
              })
            }
          </form.Subscribe>
        )}
      </div>
    </form>
  );
};
