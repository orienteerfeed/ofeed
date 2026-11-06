import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  registrationFeeDiscountsSchema,
  type RegistrationFeeDiscount,
} from '@repo/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms';
import { Input } from '@/components/ui/input';
import { toast } from '@/utils';

export const REGISTRATION_FEE_DISCOUNT_SETTINGS = gql`
  query RegistrationFeeDiscountSettings($eventId: String!) {
    eventServiceSettings(eventId: $eventId) {
      eventId
      registrationFeeDiscounts {
        pattern
        discountPercent
        allowPromoCode
      }
    }
  }
`;

export const UPDATE_REGISTRATION_FEE_DISCOUNTS = gql`
  mutation UpdateRegistrationFeeDiscounts(
    $eventId: String!
    $rules: [RegistrationFeeDiscountInput!]!
  ) {
    updateRegistrationFeeDiscounts(eventId: $eventId, rules: $rules) {
      message
    }
  }
`;

type DraftRule = {
  allowPromoCode?: boolean | undefined;
  pattern: string;
  discountPercent: string;
  key: number;
};

export function RegistrationFeeDiscountSettings({
  eventId,
}: {
  eventId: string;
}) {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useQuery<{
    eventServiceSettings: {
      registrationFeeDiscounts: RegistrationFeeDiscount[];
    };
  }>(REGISTRATION_FEE_DISCOUNT_SETTINGS, { variables: { eventId } });
  const [saveRules, { loading: saving }] = useMutation(
    UPDATE_REGISTRATION_FEE_DISCOUNTS
  );
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [validationError, setValidationError] = useState(false);

  useEffect(() => {
    if (data) {
      setRules(
        data.eventServiceSettings.registrationFeeDiscounts.map((rule, key) => ({
          ...rule,
          discountPercent: String(rule.discountPercent),
          key,
        }))
      );
      setDirty(false);
      setValidationError(false);
    }
  }, [data]);

  const patch = (key: number, changes: Partial<DraftRule>) => {
    setRules(current =>
      current.map(rule => (rule.key === key ? { ...rule, ...changes } : rule))
    );
    setDirty(true);
  };

  const save = async () => {
    const parsed = registrationFeeDiscountsSchema.safeParse(
      rules.map(rule => ({
        allowPromoCode: rule.allowPromoCode ?? false,
        pattern: rule.pattern,
        discountPercent: rule.discountPercent.trim()
          ? Number(rule.discountPercent.replace(',', '.'))
          : NaN,
      }))
    );
    if (!parsed.success) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    try {
      await saveRules({ variables: { eventId, rules: parsed.data } });
      await refetch();
      setDirty(false);
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        ...(error instanceof Error ? { description: error.message } : {}),
        variant: 'error',
      });
    }
  };

  return (
    <section
      className="space-y-4"
      aria-labelledby="registration-discounts-title"
    >
      <div>
        <h3
          id="registration-discounts-title"
          className="text-base font-semibold"
        >
          {t('Pages.Event.Settings.Services.RegistrationDiscounts.Title')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Pages.Event.Settings.Services.RegistrationDiscounts.Description')}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <fieldset disabled={loading || saving || !!error} className="space-y-3">
        {rules.map(rule => (
          <div
            key={rule.key}
            className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
          >
            <div className="min-w-40 flex-1 space-y-2">
              <label
                htmlFor={`discount-pattern-${rule.key}`}
                className="text-sm font-medium"
              >
                {t(
                  'Pages.Event.Settings.Services.RegistrationDiscounts.Pattern'
                )}
              </label>
              <Input
                id={`discount-pattern-${rule.key}`}
                value={rule.pattern}
                maxLength={100}
                placeholder="ABC*"
                onChange={event =>
                  patch(rule.key, { pattern: event.target.value })
                }
              />
            </div>
            <div className="w-28 space-y-2">
              <label
                htmlFor={`discount-percent-${rule.key}`}
                className="text-sm font-medium"
              >
                {t(
                  'Pages.Event.Settings.Services.RegistrationDiscounts.Percent'
                )}
              </label>
              <Input
                id={`discount-percent-${rule.key}`}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={rule.discountPercent}
                onChange={event =>
                  patch(rule.key, { discountPercent: event.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rule.allowPromoCode ?? false}
                onChange={event =>
                  patch(rule.key, { allowPromoCode: event.target.checked })
                }
              />
              {t('PromoCodes.AllowCombination')}
            </label>
            <Button
              variant="outline"
              onClick={() => patch(rule.key, { discountPercent: '100' })}
            >
              {t('Pages.Event.Settings.Services.RegistrationDiscounts.Free')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(
                'Pages.Event.Settings.Services.RegistrationDiscounts.Remove'
              )}
              onClick={() => {
                setRules(current =>
                  current.filter(item => item.key !== rule.key)
                );
                setDirty(true);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        {!loading && rules.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Event.Settings.Services.RegistrationDiscounts.Empty')}
          </p>
        )}
        {validationError && (
          <p role="alert" className="text-sm text-destructive">
            {t(
              'Pages.Event.Settings.Services.RegistrationDiscounts.Validation'
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={rules.length >= 30}
            onClick={() => {
              setRules(current => [
                ...current,
                {
                  key: Math.max(-1, ...current.map(rule => rule.key)) + 1,
                  pattern: '',
                  discountPercent: '100',
                },
              ]);
              setDirty(true);
            }}
          >
            <Plus className="mr-2 size-4" aria-hidden />
            {t('Pages.Event.Settings.Services.RegistrationDiscounts.Add')}
          </Button>
          <Button disabled={!dirty} onClick={() => void save()}>
            {t('Pages.Event.Settings.Services.RegistrationDiscounts.Save')}
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
