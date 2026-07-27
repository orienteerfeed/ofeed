import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { TFunction } from 'i18next';

import { Button } from '@/components/atoms';
import { Field } from '@/components/organisms';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/utils';

const CREATE_EVENT_RENTAL_CARD = gql`
  mutation CreateEventRentalCard($input: CreateEventRentalCardInput!) {
    createEventRentalCard(input: $input) {
      id
      cardNumber
      active
      returned
      isLent
    }
  }
`;

type RentalCardDialogProps = {
  t: TFunction;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void | Promise<void>;
};

type RentalCardFormValues = {
  cardNumber: string;
  active: boolean;
};

const EMPTY_VALUES: RentalCardFormValues = {
  cardNumber: '',
  active: true,
};

export const RentalCardDialog = ({
  t,
  eventId,
  open,
  onOpenChange,
  onCreated,
}: RentalCardDialogProps) => {
  const [createEventRentalCard] = useMutation(CREATE_EVENT_RENTAL_CARD);

  const form = useForm({
    defaultValues: EMPTY_VALUES,
    onSubmit: async ({ value }) => {
      const cardNumber = Number.parseInt(value.cardNumber.trim(), 10);

      try {
        await createEventRentalCard({
          variables: {
            input: { eventId, cardNumber, active: value.active },
          },
        });
        form.reset();
        onOpenChange(false);
        await onCreated();
      } catch (mutationError) {
        toast({
          title: t('Operations.Error', { ns: 'common' }),
          description:
            mutationError instanceof Error
              ? mutationError.message
              : t('Pages.Event.Settings.Services.RentalCards.Dialog.SaveError'),
          variant: 'error',
        });
      }
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Event.Settings.Services.RentalCards.Dialog.Title')}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <Field
            form={form}
            name="cardNumber"
            label={t(
              'Pages.Event.Settings.Services.RentalCards.Dialog.CardNumber'
            )}
            placeholder="8123456"
            validate={value => {
              const trimmed = value.trim();
              const parsed = Number.parseInt(trimmed, 10);
              return trimmed && Number.isInteger(parsed) && parsed > 0
                ? undefined
                : t(
                    'Pages.Event.Settings.Services.RentalCards.Dialog.CardNumberInvalid'
                  );
            }}
          />
          <Field
            form={form}
            name="active"
            type="checkbox"
            label={t(
              'Pages.Event.Settings.Services.RentalCards.Columns.Active'
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t('Operations.Cancel', { ns: 'common' })}
            </Button>
            <Button type="submit">
              {t('Pages.Event.Settings.Services.RentalCards.Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
