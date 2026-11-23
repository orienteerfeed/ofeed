import { OrganizerBillingFields } from './OrganizerBillingFields';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import {
  settlementSettingsSchema,
  type SettlementSettings,
} from '@repo/shared';
import { emptyBillingDetails } from '@/components/molecules/BillingDetailsFields';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/atoms';
import { toast } from '@/utils';

const SETTINGS = gql`
  query EventSettlementSettings($eventId: String!) {
    eventSettlementSettings(eventId: $eventId) {
      enabled
      organizer {
        name
        street
        city
        postalCode
        country
        companyId
        vatId
        aresVerifiedAt
      }
    }
  }
`;
const UPDATE = gql`
  mutation UpdateEventSettlementSettings(
    $eventId: String!
    $enabled: Boolean!
    $organizer: OrganizerDetailsInput
  ) {
    updateEventSettlementSettings(
      eventId: $eventId
      enabled: $enabled
      organizer: $organizer
    ) {
      enabled
      organizer {
        aresVerifiedAt
      }
    }
  }
`;

function SettingsForm({
  eventId,
  initial,
}: {
  eventId: string;
  initial: SettlementSettings;
}) {
  const { t } = useTranslation();
  const [update, { loading }] = useMutation<{
    updateEventSettlementSettings: {
      organizer: { aresVerifiedAt?: string | null } | null;
    };
  }>(UPDATE);
  const form = useForm({
    defaultValues: {
      organizer: initial.organizer ?? emptyBillingDetails,
    },
    onSubmit: async ({ value }) => {
      const parsed = settlementSettingsSchema.safeParse({
        ...value,
        enabled: true,
      });
      if (!parsed.success) {
        toast({ title: t('Billing.Invalid'), variant: 'error' });
        return;
      }
      try {
        const result = await update({
          variables: {
            eventId,
            enabled: parsed.data.enabled,
            organizer: parsed.data.organizer
              ? Object.fromEntries(
                  Object.entries(parsed.data.organizer).filter(
                    ([key]) => key !== 'aresVerifiedAt'
                  )
                )
              : null,
          },
          refetchQueries: [SETTINGS],
        });
        if (result?.data && form.state.values.organizer === value.organizer) {
          form.setFieldValue(
            'organizer.aresVerifiedAt',
            result.data.updateEventSettlementSettings.organizer
              ?.aresVerifiedAt ?? undefined
          );
        }
        toast({ title: t('Billing.Saved'), variant: 'success' });
      } catch {
        toast({ title: t('Billing.Failed'), variant: 'error' });
      }
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      noValidate
    >
      <form.Field name="organizer">
        {field => (
          <OrganizerBillingFields
            form={form}
            eventId={eventId}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <Button type="submit" disabled={loading}>
        {t('Billing.Save')}
      </Button>
    </form>
  );
}
export function EventSettlementCard({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { data, loading, error } = useQuery<{
    eventSettlementSettings: SettlementSettings;
  }>(SETTINGS, { variables: { eventId } });
  const settings = data?.eventSettlementSettings;
  // Apollo objects include __typename: copy only contract fields into editable state.
  const initial = settings
    ? settlementSettingsSchema.parse({
        ...settings,
        organizer: settings.organizer
          ? {
              ...settings.organizer,
              vatId: settings.organizer.vatId ?? undefined,
              aresVerifiedAt: settings.organizer.aresVerifiedAt ?? undefined,
            }
          : null,
      })
    : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Billing.OrganizerTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert">{t('Billing.Failed')}</p>
        ) : loading ? (
          <p>{t('Billing.Loading')}</p>
        ) : initial ? (
          <SettingsForm eventId={eventId} initial={initial} />
        ) : null}
      </CardContent>
    </Card>
  );
}
