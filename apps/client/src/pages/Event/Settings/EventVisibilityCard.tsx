import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { ToggleSwitch, VisibilityBadge } from '../../../components/atoms';
import { toast } from '../../../utils';

// GraphQL mutation to update published status
const UPDATE_EVENT_VISIBILITY = gql`
  mutation UpdateEventVisibility($eventId: String!, $published: Boolean!) {
    updateEventVisibility(eventId: $eventId, published: $published) {
      message
      event {
        id
        published
      }
    }
  }
`;

interface UpdateEventVisibilityResponse {
  updateEventVisibility: {
    message: string;
    event: {
      id: string;
      published: boolean;
    };
  };
}

interface UpdateEventVisibilityVariables {
  eventId: string;
  published: boolean;
}

interface EventVisibilityCardProps {
  t: TFunction;
  eventId: string;
  isPublished: boolean;
}

export const EventVisibilityCard: React.FC<EventVisibilityCardProps> = ({
  t,
  eventId,
  isPublished,
}) => {
  const [published, setPublished] = useState(isPublished || false);

  const [updateEventVisibility, { loading }] = useMutation<
    UpdateEventVisibilityResponse,
    UpdateEventVisibilityVariables
  >(UPDATE_EVENT_VISIBILITY, {
    update(cache, { data }) {
      if (data?.updateEventVisibility?.event) {
        const eventId = data.updateEventVisibility.event.id;

        // Update the cache manually if needed
        cache.modify({
          id: `Event:${eventId}`, // Explicit ID format
          fields: {
            published() {
              return data.updateEventVisibility.event.published;
            },
          },
        });
      }
    },
  });

  const handleToggleEventVisibility = async () => {
    try {
      const { data } = await updateEventVisibility({
        variables: { eventId: eventId, published: !published },
      });

      if (data?.updateEventVisibility) {
        setPublished(!published);
        toast({
          title: t('Operations.Success', { ns: 'common' }),
          description: t('Pages.Event.Visibility.Toast.UpdateSuccess', {
            status: !published
              ? t('Public', { ns: 'common' })
              : t('Private', { ns: 'common' }),
          }),
          variant: 'default',
        });
      } else {
        toast({
          title: t('Pages.Event.Visibility.Toast.UpdateFail'),
          variant: 'error',
        });
      }
    } catch (error) {
      console.error('Error updating event visibility:', error);
      toast({
        title: t('Pages.Event.Visibility.Toast.UpdateFail'),
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'error',
      });
    }
  };

  return (
    <Card className="w-full h-fit">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          {t('Pages.Event.Visibility.Card.Title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Event.Visibility.Card.Description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <ToggleSwitch
                id="event-visibility"
                checked={published}
                onCheckedChange={handleToggleEventVisibility}
                disabled={loading}
              />
            </div>

            {!loading ? (
              <VisibilityBadge isPublic={published} />
            ) : (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  {t('Loading', { ns: 'common' })}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
