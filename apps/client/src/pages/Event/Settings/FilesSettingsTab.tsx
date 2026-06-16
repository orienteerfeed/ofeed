import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { CheckCircle2, Circle, Copy, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { DragDropFile } from '@/components/organisms';
import { formatDateTimeSeconds, getLocaleKey } from '@/lib/date';
import { toast } from '@/utils';

const IOF_XML_V3 = 'IOF XML v3';

export type RadioControl = {
  id: number;
  code: string;
  type: string;
  radio: boolean;
};

type FileSectionStatus = {
  available: boolean;
  source?: string | null;
};

export type EventFilesStatus = {
  startList: FileSectionStatus;
  courses: FileSectionStatus;
  results: FileSectionStatus;
  radioControls: RadioControl[];
};

type EventFilesStatusData = {
  eventFilesStatus: EventFilesStatus;
};

export type EventImportStateEntry = {
  sourceType: string;
  payloadType: string;
  rawHash: string;
  creator?: string | null;
  externalStatus?: string | null;
  lastSuccessfulImportAt?: string | null;
  successCount: number;
  skippedCount: number;
};

type EventImportStatesData = {
  eventImportStates: EventImportStateEntry[];
};

export const GET_EVENT_FILES_STATUS = gql`
  query EventFilesStatus($eventId: String!) {
    eventFilesStatus(eventId: $eventId) {
      startList {
        available
        classesCount
        competitorsCount
        competitorsWithStartTimeCount
        source
      }
      courses {
        available
        coursesCount
        controlsCount
        courseControlsCount
        source
      }
      results {
        available
        competitorsCount
        competitorsWithResultDataCount
        source
      }
      radioControls {
        id
        code
        type
        radio
      }
    }
  }
`;

export const GET_EVENT_IMPORT_STATES = gql`
  query EventImportStates($eventId: String!) {
    eventImportStates(eventId: $eventId) {
      sourceType
      payloadType
      rawHash
      creator
      externalStatus
      lastSuccessfulImportAt
      successCount
      skippedCount
    }
  }
`;

export const UPDATE_CONTROL_RADIO_FLAG = gql`
  mutation UpdateControlRadioFlag(
    $eventId: String!
    $controlId: Int!
    $radio: Boolean!
  ) {
    updateControlRadioFlag(eventId: $eventId, controlId: $controlId, radio: $radio) {
      id
      radio
    }
  }
`;

interface FilesSettingsTabProps {
  t: TFunction;
  eventId: string;
}

const ImportStateMeta = ({ importState }: { importState: EventImportStateEntry }) => {
  const { t, i18n } = useTranslation();
  const locale = getLocaleKey(i18n.language);

  const truncatedHash = `${importState.rawHash.slice(0, 8)}…`;

  const handleCopyHash = () => {
    void navigator.clipboard.writeText(importState.rawHash);
    toast({ title: t('Pages.Event.Settings.Files.ImportState.HashCopied') });
  };

  return (
    <>
      <Separator className="my-2" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {importState.lastSuccessfulImportAt ? (
          <span>
            {t('Pages.Event.Settings.Files.ImportState.LastSuccessfulImport')}:{' '}
            {formatDateTimeSeconds(importState.lastSuccessfulImportAt, locale)}
          </span>
        ) : null}
        {importState.creator ? (
          <span>
            {t('Pages.Event.Settings.Files.ImportState.Creator')}:{' '}
            {importState.creator}
          </span>
        ) : null}
        {importState.externalStatus ? (
          <span>
            {t('Pages.Event.Settings.Files.ImportState.ExternalStatus')}:{' '}
            {importState.externalStatus}
          </span>
        ) : null}
        <span>
          {t('Pages.Event.Settings.Files.ImportState.SuccessCount')}:{' '}
          {importState.successCount}
        </span>
        <span>
          {t('Pages.Event.Settings.Files.ImportState.SkippedCount')}:{' '}
          {importState.skippedCount}
        </span>
        <button
          type="button"
          onClick={handleCopyHash}
          className="inline-flex cursor-pointer items-center gap-1 font-mono transition-colors hover:text-foreground"
          title={t('Pages.Event.Settings.Files.ImportState.CopyHash')}
        >
          <Copy className="h-3 w-3" />
          {truncatedHash}
        </button>
      </div>
    </>
  );
};

interface FileSectionProps {
  t: TFunction;
  eventId: string;
  title: string;
  available: boolean;
  format?: string;
  helper?: string;
  disabled?: boolean;
  disabledHint?: string;
  importState?: EventImportStateEntry | null;
  onUploaded: () => void;
}

const StatusIcon = ({ available, t }: { available: boolean; t: TFunction }) => {
  const label = available
    ? t('Pages.Event.Settings.Files.Available')
    : t('Pages.Event.Settings.Files.Missing');
  return available ? (
    <CheckCircle2
      className="h-5 w-5 shrink-0 text-green-600 dark:text-green-500"
      aria-label={label}
    />
  ) : (
    <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-label={label} />
  );
};

const FileSection = ({
  t,
  eventId,
  title,
  available,
  format,
  helper,
  disabled = false,
  disabledHint,
  importState,
  onUploaded,
}: FileSectionProps) => (
  <Card className={disabled ? 'opacity-60' : undefined}>
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {disabled ? (
            <Lock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <StatusIcon available={available} t={t} />
          )}
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {disabled
                ? t('Pages.Event.Settings.Files.Locked')
                : available
                  ? t('Pages.Event.Settings.Files.Available')
                  : t('Pages.Event.Settings.Files.Missing')}
            </CardDescription>
          </div>
        </div>
        {format ? (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {format}
          </span>
        ) : null}
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {helper ? <p className="text-sm text-muted-foreground">{helper}</p> : null}
      {disabled ? (
        <p className="text-sm text-muted-foreground">
          {disabledHint ?? t('Pages.Event.Settings.Files.CoursesDisabledHint')}
        </p>
      ) : (
        <DragDropFile eventId={eventId} hideHeader onUploadSuccess={onUploaded} />
      )}
      {importState ? <ImportStateMeta importState={importState} /> : null}
    </CardContent>
  </Card>
);

// Prepared for future development of online split controls.
// Backend/data flow stays intact, but the UI is intentionally hidden until the feature is ready.

export const FilesSettingsTab = ({ t, eventId }: FilesSettingsTabProps) => {
  const { data, loading, error, refetch } = useQuery<EventFilesStatusData>(
    GET_EVENT_FILES_STATUS,
    { variables: { eventId } }
  );

  const { data: importStatesData } = useQuery<EventImportStatesData>(
    GET_EVENT_IMPORT_STATES,
    { variables: { eventId } }
  );

  const status = data?.eventFilesStatus;

  const importStates = importStatesData?.eventImportStates ?? [];

  const findImportState = (payloadType: string): EventImportStateEntry | null =>
    importStates.find(
      (s) => s.sourceType === 'IOF_XML' && s.payloadType === payloadType
    ) ?? null;

  const handleUploaded = () => {
    void refetch();
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-destructive">
        <p>{error.message}</p>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const coursesUploadLocked =
    !status.startList.available && !status.results.available;

  return (
    <div className="space-y-6">
      <FileSection
        t={t}
        eventId={eventId}
        title={t('Pages.Event.Settings.Files.StartList')}
        format={IOF_XML_V3}
        available={status.startList.available}
        importState={findImportState('StartList')}
        onUploaded={handleUploaded}
      />

      <FileSection
        t={t}
        eventId={eventId}
        title={t('Pages.Event.Settings.Files.Courses')}
        format={IOF_XML_V3}
        available={status.courses.available}
        disabled={coursesUploadLocked}
        importState={findImportState('CourseData')}
        onUploaded={handleUploaded}
      />

      {/*
        Prepared for future development of online split controls.
        Keep the backend/data flow intact, but hide this UI until the feature is ready.

        <RadioControlsSection
          t={t}
          eventId={eventId}
          coursesAvailable={status.courses.available}
          controls={status.radioControls}
          onRefetch={handleUploaded}
        />
      */}

      <FileSection
        t={t}
        eventId={eventId}
        title={t('Pages.Event.Settings.Files.Results')}
        format={IOF_XML_V3}
        available={status.results.available}
        importState={findImportState('ResultList')}
        onUploaded={handleUploaded}
      />
    </div>
  );
};
