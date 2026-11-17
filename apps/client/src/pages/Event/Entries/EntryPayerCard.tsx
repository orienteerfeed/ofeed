import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { billingDetailsSchema, type BillingDetails } from '@repo/shared';
import {
  BillingDetailsFields,
  emptyBillingDetails,
} from '@/components/molecules/BillingDetailsFields';
import { Button } from '@/components/atoms';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from '@/utils';
const UPDATE = gql`
  mutation EntryOrderPayerUpdate(
    $entryId: String!
    $payer: BillingDetailsInput
  ) {
    entryOrderPayerUpdate(entryId: $entryId, payer: $payer) {
      id
      payerDetails {
        name
        street
        city
        postalCode
        country
        companyId
        vatId
      }
    }
  }
`;
export function EntryPayerCard({
  entryId,
  payer,
  onSaved,
}: {
  entryId: string;
  payer: BillingDetails | null;
  onSaved: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [update, { loading }] = useMutation(UPDATE);
  const form = useForm({
    defaultValues: {
      enabled: Boolean(payer),
      details: payer
        ? billingDetailsSchema.parse({
            ...payer,
            companyId: payer.companyId ?? undefined,
            vatId: payer.vatId ?? undefined,
          })
        : emptyBillingDetails,
    },
    onSubmit: async ({ value }) => {
      const parsed = billingDetailsSchema
        .nullable()
        .safeParse(value.enabled ? value.details : null);
      if (!parsed.success) {
        toast({ title: t('Billing.Invalid'), variant: 'error' });
        return;
      }
      try {
        await update({ variables: { entryId, payer: parsed.data } });
        await onSaved();
        toast({ title: t('Billing.Saved'), variant: 'success' });
      } catch {
        toast({ title: t('Billing.Failed'), variant: 'error' });
      }
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Billing.PayerTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          noValidate
          onSubmit={e => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="enabled">
            {field => (
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={field.state.value}
                  onChange={e => field.handleChange(e.target.checked)}
                />
                {t('Billing.UsePayer')}
              </label>
            )}
          </form.Field>
          <form.Subscribe selector={state => state.values.enabled}>
            {enabled =>
              enabled ? (
                <form.Field name="details">
                  {field => (
                    <BillingDetailsFields
                      form={form}
                      countryFieldName="details.country"
                      value={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              ) : null
            }
          </form.Subscribe>
          <Button type="submit" disabled={loading}>
            {t('Billing.Save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
