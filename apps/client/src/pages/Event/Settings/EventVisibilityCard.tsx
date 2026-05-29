import { Card } from '@/components/ui/card';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ToggleSwitch } from '../../../components/atoms';
import { toast } from '../../../utils';

const UPDATE_EVENT_PUBLISHING_STATUS = gql`
  mutation UpdateEventPublishingStatus($eventId: String!, $published: Boolean!) {
    updateEventPublishingStatus: updateEventVisibility(eventId: $eventId, published: $published) {
      message
      event {
        id
        published
      }
    }
  }
`;

type UpdateEventPublishingStatusResponse = {
  updateEventPublishingStatus: {
    event: {
      id: string;
      published: boolean;
    };
  };
};

type UpdateEventPublishingStatusVariables = {
  eventId: string;
  published: boolean;
};

type EventVisibilityCardProps = {
  t: TFunction;
  eventId: string;
  isPublished: boolean;
  onUpdated?: () => Promise<void> | void;
};

export const EventVisibilityCard = ({
  t,
  eventId,
  isPublished,
  onUpdated,
}: EventVisibilityCardProps) => {
  const [published, setPublished] = useState(isPublished);

  useEffect(() => {
    setPublished(isPublished);
  }, [isPublished]);

  const [updateEventPublishingStatus, { loading }] = useMutation<
    UpdateEventPublishingStatusResponse,
    UpdateEventPublishingStatusVariables
  >(UPDATE_EVENT_PUBLISHING_STATUS, {
    update(cache, { data }) {
      const updatedEvent = data?.updateEventPublishingStatus.event;
      if (!updatedEvent) {
        return;
      }

      const cacheId = cache.identify({ __typename: 'Event', id: updatedEvent.id });
      if (!cacheId) {
        return;
      }

      cache.modify({
        id: cacheId,
        fields: {
          published() {
            return updatedEvent.published;
          },
        },
      });
    },
  });

  const handleToggleEventPublishing = async (nextPublished: boolean) => {
    try {
      const { data } = await updateEventPublishingStatus({
        variables: { eventId, published: nextPublished },
      });

      const updatedPublished = data?.updateEventPublishingStatus.event.published;
      if (typeof updatedPublished !== 'boolean') {
        toast({
          title: t('Pages.Event.PublishingStatus.Toast.UpdateFail'),
          variant: 'error',
        });
        return;
      }

      setPublished(updatedPublished);
      await onUpdated?.();
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Event.PublishingStatus.Toast.UpdateSuccess', {
          status: updatedPublished
            ? t('Pages.Event.PublishingStatus.Card.Publish')
            : t('Pages.Event.PublishingStatus.Card.Draft'),
        }),
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: t('Pages.Event.PublishingStatus.Toast.UpdateFail'),
        ...(error instanceof Error ? { description: error.message } : {}),
        variant: 'error',
      });
    }
  };

  return (
    <Card className="flex w-full items-center justify-between gap-3 px-3 py-2 sm:w-auto">
      <div className="min-w-0">
        <p className="text-[11px] font-medium leading-none text-muted-foreground">
          {t('Pages.Event.PublishingStatus.Card.ActionTitle')}
        </p>
        <p
          className={
            published
              ? 'mt-1 text-sm font-semibold leading-none'
              : 'mt-1 text-sm font-semibold leading-none text-orange-700'
          }
        >
          {published
            ? t('Pages.Event.PublishingStatus.Card.Published')
            : t('Pages.Event.PublishingStatus.Card.Unpublished')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <ToggleSwitch
          id="event-publishing-status"
          checked={published}
          onCheckedChange={handleToggleEventPublishing}
          disabled={loading}
          aria-label={t('Pages.Event.PublishingStatus.Card.ActionTitle')}
        />
      </div>
    </Card>
  );
};
