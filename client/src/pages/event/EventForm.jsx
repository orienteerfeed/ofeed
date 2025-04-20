import React, { useEffect } from 'react';
import { Formik } from 'formik';
import { gql, useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { toDate, format } from 'date-fns-tz';

import { Label } from '../../atoms';
import { Field, SubmitButton } from '../../organisms';
import { translatedValidations, useRequest, toast } from '../../utils';

import PATHNAMES from '../../pathnames';
import ENDPOINTS from '../../endpoints';

const GET_SPORTS = gql`
  query SportsQuery {
    sports {
      id
      name
    }
  }
`;

const GET_COUNTRY = gql`
  query CountriesQuery {
    countries {
      countryCode
      countryName
    }
  }
`;

export const EventForm = ({
  t,
  initialData = null,
  renderSubmitButton = false,
}) => {
  const navigate = useNavigate(); // Initialize the useNavigate hook

  const {
    object,
    boolean,
    number,
    string,
    requiredNumber,
    requiredString,
    requiredDate,
    gpsLatitude,
    gpsLongitude,
  } = translatedValidations(t);

  const schema = object({
    eventName: requiredString,
    sport: requiredNumber,
    organizer: requiredString,
    date: requiredDate,
    timezone: requiredString,
    location: requiredString,
    latitude: gpsLatitude,
    longitude: gpsLongitude,
    country: string,
    zeroTime: requiredDate,
    ranking: boolean,
    coefRanking: number,
    relay: boolean,
    published: boolean,
    hundredthPrecision: boolean,
  });

  const request = useRequest();

  const onSubmitCallback = async (
    {
      eventName,
      sport,
      organizer,
      date,
      timezone,
      location,
      latitude,
      longitude,
      country,
      zeroTime,
      ranking,
      coefRanking,
      relay,
      published,
      hundredthPrecision,
    },
    setSubmitting,
  ) => {
    const method = initialData ? 'PUT' : 'POST'; // Decide if it's edit (PUT) or create (POST)
    const url = initialData
      ? ENDPOINTS.eventDetail(initialData.id) // For edit, include the event ID
      : ENDPOINTS.events();
    request.request(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: eventName,
        sportId: parseInt(sport, 10),
        organizer,
        date,
        timezone,
        location,
        latitude,
        longitude,
        country,
        zeroTime,
        ranking,
        coefRanking: parseFloat(coefRanking),
        relay,
        published,
        hundredthPrecision,
      }),
      onSuccess: (response) => {
        console.log('Form submitted successfully');
        setSubmitting(false);
        toast({
          title: t('Operations.Success', { ns: 'common' }),
          description: t('Pages.Event.Form.Toast.EditSuccess'),
          variant: 'success',
        });
        // Navigate to the detail page of the event
        navigate(PATHNAMES.getEventSettings(response.results.data.id));
      },
      onError: (err) => {
        console.log(err);

        // Zkontrolujeme, zda existují chyby ve formátu, jaký jste uvedl
        if (err.errors && Array.isArray(err.errors)) {
          // Projdeme chyby a zobrazíme každou zprávu
          err.errors.forEach((error) => {
            toast.error(`${error.param}: ${error.msg}`); // Použití toastu pro zobrazení každé chyby
          });
        } else {
          console.log('something failed');
        }

        setSubmitting(false); // Zastavení odesílání
      },
    });
  };

  // Použití useQuery hooku pro provedení dotazu
  const { error, data } = useQuery(GET_SPORTS);
  // Převedení výsledku na formát { value, label }
  const optionsSports =
    typeof data !== 'undefined' && data.sports.length > 0
      ? data.sports.map((sport) => ({
          value: sport.id,
          label: sport.name,
        }))
      : [];

  // Generate timezone options with UTC offset
  const timezones = Intl.supportedValuesOf('timeZone').map((tz) => ({
    value: tz,
    label: `${tz} (UTC ${format(toDate(new Date(), { timeZone: tz }), 'XXX')})`,
  }));

  // Použití useQuery hooku pro provedení dotazu
  const { error: errorCountries, data: dataCountries } = useQuery(GET_COUNTRY);
  const optionsCountries =
    typeof dataCountries !== 'undefined' && dataCountries.countries.length > 0
      ? dataCountries.countries.map((country) => ({
          value: country.countryCode,
          label: country.countryName,
        }))
      : [];

  // Zobrazit toastovou notifikaci při chybě
  useEffect(() => {
    if (error) {
      toast({
        title: t('ErrorMessage', { ns: 'common' }),
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [error, errorCountries, t]);

  // Pre-fill form with initial data for editing
  const initialValues = initialData
    ? {
        eventName: initialData.eventName,
        sport: initialData.sportId,
        date: initialData.date,
        timezone: initialData.timezone,
        organizer: initialData.organizer,
        location: initialData.location,
        latitude: initialData.latitude,
        longitude: initialData.longitude,
        country: initialData.country,
        zeroTime: initialData.zeroTime,
        ranking: initialData.ranking,
        coefRanking: initialData.coefRanking,
        relay: initialData.relay,
        published: initialData.published,
        hundredthPrecision: initialData.hundredthPrecision,
      }
    : {
        eventName: '',
        sport: '',
        date: '',
        timezone: 'Europe/Prague',
        organizer: '',
        location: '',
        latitude: '',
        longitude: '',
        country: '',
        zeroTime: '',
        ranking: false,
        coefRanking: '',
        relay: false,
        published: false,
        hundredthPrecision: false,
      };
  return (
    <Formik
      initialValues={initialValues}
      validationSchema={schema}
      onSubmit={(values, { setSubmitting }) => {
        onSubmitCallback(values, setSubmitting);
      }}
    >
      {({
        handleChange,
        handleSubmit,
        isSubmitting,
        values,
        /* and other goodies */
      }) => (
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-1">
              <Label htmlFor="eventName">
                {t('Pages.Event.Form.EventName')}
              </Label>
              <Field
                id="eventName"
                name="eventName"
                placeholder={t('Pages.Event.Form.Placeholders.EventName')}
                type="text"
                autoCapitalize="none"
                autoComplete="none"
                autoCorrect="off"
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sport">{t('Pages.Event.Form.Sport')}</Label>
              <Field
                id="sport"
                name="sport"
                type="select"
                options={optionsSports}
                value={values.sport}
                onChange={handleChange}
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="date">{t('Pages.Event.Form.Date')}</Label>
              <Field id="date" name="date" type="date" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="timezone">{t('Pages.Event.Form.Timezone')}</Label>
              <Field
                id="timezone"
                name="timezone"
                type="select"
                options={timezones}
                value={values.timezone}
                onChange={handleChange}
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="organizer">
                {t('Pages.Event.Form.Organiser')}
              </Label>
              <Field
                id="organizer"
                name="organizer"
                placeholder="K.O.B. Choceň ❤️"
                type="text"
                autoCapitalize="none"
                autoComplete="none"
                autoCorrect="off"
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="location">{t('Pages.Event.Form.Location')}</Label>
              <Field
                id="location"
                name="location"
                placeholder="Brno-vesnice"
                type="text"
                autoCapitalize="none"
                autoComplete="none"
                autoCorrect="off"
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="latitude">{t('Pages.Event.Form.Latitude')}</Label>
              <Field
                id="latitude"
                name="latitude"
                type="number"
                step="0.000001"
                placeholder={t('Pages.Event.Form.Placeholders.Latitude')}
                value={values.latitude}
                onChange={handleChange}
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="longitude">
                {t('Pages.Event.Form.Longitude')}
              </Label>
              <Field
                id="longitude"
                name="longitude"
                type="number"
                step="0.000001"
                placeholder={t('Pages.Event.Form.Placeholders.Longitude')}
                value={values.longitude}
                onChange={handleChange}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="country">{t('Pages.Event.Form.Country')}</Label>
              <Field
                id="country"
                name="country"
                type="select"
                options={optionsCountries}
                value={values.country}
                onChange={handleChange}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="zeroTime">{t('Pages.Event.Form.ZeroTime')}</Label>
              <Field
                id="zeroTime"
                name="zeroTime"
                type="datetime-local"
                autoCapitalize="none"
                autoComplete="none"
                autoCorrect="off"
                required
              />
            </div>
            <div className="grid gap-1">
              <div className="flex flex-row gap-4">
                <div className="flex-none">
                  <Label htmlFor="ranking">
                    {t('Pages.Event.Form.Ranking')}
                  </Label>
                  <Field id="ranking" name="ranking" type="checkbox" />
                </div>
                <div className="flex-grow">
                  <Label htmlFor="coefRanking">
                    {t('Pages.Event.Form.CoefRanking')}
                  </Label>
                  <Field
                    id="coefRanking"
                    name="coefRanking"
                    placeholder="1.02"
                    type="number"
                    autoCapitalize="none"
                    autoComplete="none"
                    autoCorrect="off"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-1 justify-start">
              <div className="flex flex-row gap-4">
                <div>
                  <Label htmlFor="relay">{t('Pages.Event.Form.Relay')}</Label>
                  <Field id="relay" name="relay" type="checkbox" />
                </div>
                <div>
                  <Label htmlFor="hundredthPrecision">
                    {t('Pages.Event.Form.HundredthPrecision')}
                  </Label>
                  <Field
                    id="hundredthPrecision"
                    name="hundredthPrecision"
                    type="checkbox"
                    checked={values.hundredthPrecision}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-1 justify-start">
              <Label htmlFor="published">
                {t('Pages.Event.Form.Published')}
              </Label>
              <Field id="published" name="published" type="checkbox" />
            </div>
            {!renderSubmitButton && (
              <div className="grid gap-1">
                <SubmitButton variant="default" disabled={isSubmitting}>
                  {isSubmitting
                    ? t('Operations.Submitting', { ns: 'common' })
                    : t('Operations.Submit', { ns: 'common' })}
                </SubmitButton>
              </div>
            )}
          </div>
          {/* Custom render function for submit button if provided */}
          {renderSubmitButton && renderSubmitButton({ isSubmitting })}
        </form>
      )}
    </Formik>
  );
};
