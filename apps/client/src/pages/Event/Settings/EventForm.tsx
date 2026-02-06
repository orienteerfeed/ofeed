import { ButtonWithSpinner } from '@/components/molecules';
import { Field, type AnyReactFormApi } from '@/components/organisms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { format, toDate } from 'date-fns-tz';
import { TFunction } from 'i18next';
import { Upload, X } from 'lucide-react';
import React, { useEffect } from 'react';
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
  renderSubmitButton?: (props: {
    isSubmitting: boolean;
    canSubmit: boolean;
  }) => React.ReactNode;
}

// Helper function to convert EventFormData to EventFormValues
const convertToFormValues = (
  event: Partial<EventFormData>
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
  zeroTime: event.zeroTime || '',
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
  renderSubmitButton,
}) => {
  const navigate = useNavigate();
  const request = useRequest();
  const imageRequest = useRequest();
  const [featuredImage, setFeaturedImage] = React.useState<File | null>(null);
  const [isDraggingImage, setIsDraggingImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    return () => {
      if (featuredImagePreview) {
        URL.revokeObjectURL(featuredImagePreview);
      }
    };
  }, [featuredImagePreview]);

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
    return undefined;
  };

  const form = useForm({
    defaultValues: initialData
      ? convertToFormValues(initialData)
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

      let savedEventId: string | undefined;

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
            zeroTime: value.zeroTime,
            ranking: value.ranking,
            coefRanking: value.coefRanking
              ? parseFloat(value.coefRanking)
              : undefined,
            relay: value.relay,
            published: value.published,
            hundredthPrecision: value.hundredthPrecision,
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
            type="datetime-local"
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
