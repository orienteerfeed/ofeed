import { config } from '@/config';
import { formatDate } from '@/lib/utils';
import { TFunction } from 'i18next';
import { DragDropFile } from '../../../components/organisms';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { Event, EventFormData } from '../../../types';
import { DangerZoneCard } from './DangerZoneCard';
import { EventExternalLinkCard } from './EventExternalLinkCard';
import { EventInfoCard } from './EventInfoCard';
import { EventIntegrationsCard } from './EventIntegrationsCard';
import { EventLinkCard } from './EventLinkCard';
import { EventPasswordCard } from './EventPasswordCard';
import { EventPublishingScheduleCard } from './EventPublishingScheduleCard';
import { TroubleShootingCard } from './TroubleShootingCard';

interface GeneralSettingsTabProps {
  t: TFunction;
  eventId: string;
  event: Event;
  initialData: Partial<EventFormData> | null;
  password: string;
  expiresAt: string | undefined;
  onPasswordUpdate: (value: string) => void;
  onEventDataDeleted: () => void;
  refetch: () => Promise<unknown>;
}

export const GeneralSettingsTab = ({
  t,
  eventId,
  event,
  initialData,
  password,
  expiresAt,
  onPasswordUpdate,
  onEventDataDeleted,
  refetch,
}: GeneralSettingsTabProps) => {
  const apiEventsEndpoint = new URL(ENDPOINTS.events(), config.BASE_API_URL).href;

  return (
    <div className="grid items-start gap-8">
      <DragDropFile eventId={eventId} />

      <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6">
        <div className="break-inside-avoid">
          <EventInfoCard t={t} initialData={initialData} />
        </div>
        <div className="break-inside-avoid">
          <EventPublishingScheduleCard
            t={t}
            eventId={eventId}
            eventData={event}
            onUpdated={async () => {
              await refetch();
            }}
          />
        </div>
        <div className="break-inside-avoid">
          <EventExternalLinkCard
            t={t}
            eventId={eventId}
            initialData={initialData}
            onUpdated={async () => {
              await refetch();
            }}
          />
        </div>
        <div className="break-inside-avoid">
          <EventPasswordCard
            t={t}
            eventId={initialData?.id || ''}
            eventData={event}
            password={password}
            expiresAt={expiresAt}
            onPasswordUpdate={onPasswordUpdate}
          />
        </div>
        <div className="break-inside-avoid">
          <EventIntegrationsCard
            t={t}
            eventId={eventId}
            eventPassword={password}
            eventName={event.name}
            eventDate={formatDate(event.date)}
            apiEventsEndpoint={apiEventsEndpoint}
            apiBaseUrl={config.BASE_API_URL}
            meosEventBindings={event.meosEventBindings ?? []}
            onMeosBindingChanged={refetch}
          />
        </div>
        <div className="break-inside-avoid">
          <EventLinkCard
            t={t}
            eventId={initialData?.id || ''}
            eventSlug={event.slug ?? null}
            eventName={event.name}
            eventLocation={event.location}
            eventDateFormatted={formatDate(event.date)}
            onSlugUpdated={async () => {
              await refetch();
            }}
          />
        </div>
        <div className="break-inside-avoid">
          <DangerZoneCard t={t} eventId={eventId} onEventDataDeleted={onEventDataDeleted} />
        </div>
        <div className="break-inside-avoid">
          <TroubleShootingCard t={t} />
        </div>
      </div>
    </div>
  );
};
