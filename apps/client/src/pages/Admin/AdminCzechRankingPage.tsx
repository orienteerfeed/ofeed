import type {
  AdminCzechRankingEventDataset,
  AdminCzechRankingEventEntry,
  AdminCzechRankingSnapshotDataset,
  AdminCzechRankingSnapshotEntry,
  CzechRankingCategory,
  CzechRankingType,
} from '@repo/shared';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CircleHelp,
  Database,
  Eye,
  FileSpreadsheet,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ComponentType, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '@/components/atoms';
import Tooltip from '@/components/atoms/Tooltip';
import { AppDataTable } from '@/components/organisms';
import {
  ButtonWithSpinner,
  ConfirmDialog,
  DragDropContainer,
} from '@/components/molecules';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PATHNAMES } from '@/lib/paths/pathnames';
import { AdminPageLayout } from '@/templates';
import type { UploadedFile } from '@/types/upload';
import { toast } from '@/utils';

import {
  useAdminCzechRankingClearEventResultsMutation,
  useAdminCzechRankingClearSnapshotsMutation,
  useAdminCzechRankingEventDetailQuery,
  useAdminCzechRankingOverviewQuery,
  useAdminCzechRankingOrisSyncMutation,
  useAdminCzechRankingSnapshotDetailQuery,
  useAdminCzechRankingSnapshotUploadMutation,
} from './admin.hooks';

type SnapshotClearTarget = AdminCzechRankingSnapshotDataset | 'ALL' | null;
type EventResultsClearTarget = AdminCzechRankingEventDataset | 'ALL' | null;

function formatDate(value: string | Date) {
  return format(new Date(value), 'dd.MM.yyyy');
}

function formatDateTime(value: string | Date) {
  return format(new Date(value), 'dd.MM.yyyy HH:mm');
}

function formatMonth(value: string | Date) {
  return format(new Date(value), 'MM/yyyy');
}

function toMonthInputValue(value: string | Date) {
  return format(new Date(value), 'yyyy-MM');
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-2 text-3xl">
            {value.toLocaleString()}
          </CardTitle>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/50 p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function FieldLabelWithHelp({
  htmlFor,
  label,
  helpText,
}: {
  htmlFor?: string;
  label: string;
  helpText: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Tooltip
        content={
          <div className="max-w-xs whitespace-pre-line text-left">
            {helpText}
          </div>
        }
        side="top"
        align="start"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          <span className="sr-only">{label}</span>
        </Button>
      </Tooltip>
    </div>
  );
}

function SnapshotDetailTable({
  items,
}: {
  items: AdminCzechRankingSnapshotEntry[];
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border">
      <ScrollArea className="h-[26rem]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.Place')}
              </TableHead>
              <TableHead>{t('Pages.Admin.Table.Name')}</TableHead>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.Registration')}
              </TableHead>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.Points')}
              </TableHead>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.RankIndex')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>{item.place}</TableCell>
                <TableCell className="font-medium">
                  {item.firstName} {item.lastName}
                </TableCell>
                <TableCell>{item.registration}</TableCell>
                <TableCell>{item.points}</TableCell>
                <TableCell>{item.rankIndex}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

function EventResultDetailTable({
  items,
}: {
  items: AdminCzechRankingEventEntry[];
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border">
      <ScrollArea className="h-[26rem]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.Class')}
              </TableHead>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.Place')}
              </TableHead>
              <TableHead>{t('Pages.Admin.Table.Name')}</TableHead>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.Registration')}
              </TableHead>
              <TableHead>{t('Pages.Admin.CzechRanking.Detail.Time')}</TableHead>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.Points')}
              </TableHead>
              <TableHead>
                {t('Pages.Admin.CzechRanking.Detail.ReferenceValue')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>{item.className}</TableCell>
                <TableCell>{item.place ?? '—'}</TableCell>
                <TableCell className="font-medium">
                  {item.competitorName || '—'}
                </TableCell>
                <TableCell>{item.registration}</TableCell>
                <TableCell>{item.time || '—'}</TableCell>
                <TableCell>{item.rankingPoints}</TableCell>
                <TableCell>{item.rankingReferenceValue ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

export function AdminCzechRankingPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useAdminCzechRankingOverviewQuery();

  const uploadMutation = useAdminCzechRankingSnapshotUploadMutation();
  const syncMutation = useAdminCzechRankingOrisSyncMutation();
  const clearSnapshotsMutation = useAdminCzechRankingClearSnapshotsMutation();
  const clearEventResultsMutation =
    useAdminCzechRankingClearEventResultsMutation();

  const [tabValue, setTabValue] = useState<'snapshots' | 'eventResults'>(
    'snapshots'
  );
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<AdminCzechRankingSnapshotDataset | null>(null);
  const [selectedEventDataset, setSelectedEventDataset] =
    useState<AdminCzechRankingEventDataset | null>(null);
  const [snapshotClearTarget, setSnapshotClearTarget] =
    useState<SnapshotClearTarget>(null);
  const [eventResultsClearTarget, setEventResultsClearTarget] =
    useState<EventResultsClearTarget>(null);

  const [uploadRankingType, setUploadRankingType] =
    useState<CzechRankingType>('FOREST');
  const [uploadRankingCategory, setUploadRankingCategory] =
    useState<CzechRankingCategory>('M');
  const [uploadValidForMonth, setUploadValidForMonth] = useState(
    format(new Date(), 'yyyy-MM')
  );
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [syncScope, setSyncScope] = useState<'ALL' | CzechRankingType>('ALL');

  const snapshotDetailQuery = useAdminCzechRankingSnapshotDetailQuery(
    selectedSnapshot
      ? {
          rankingType: selectedSnapshot.rankingType,
          rankingCategory: selectedSnapshot.rankingCategory,
          validForMonth: toMonthInputValue(selectedSnapshot.validForMonth),
        }
      : null
  );

  const eventDetailQuery = useAdminCzechRankingEventDetailQuery(
    selectedEventDataset
      ? {
          externalEventId: selectedEventDataset.externalEventId,
          rankingType: selectedEventDataset.rankingType,
          rankingCategory: selectedEventDataset.rankingCategory,
        }
      : null
  );

  const summaryCards = useMemo(
    () => [
      {
        key: 'snapshotDatasets',
        title: t('Pages.Admin.CzechRanking.Cards.SnapshotDatasets'),
        value: data?.summary.snapshotDatasetCount ?? 0,
        description: t('Pages.Admin.CzechRanking.Cards.SnapshotDatasetsHint'),
        icon: Database,
      },
      {
        key: 'snapshotEntries',
        title: t('Pages.Admin.CzechRanking.Cards.SnapshotEntries'),
        value: data?.summary.snapshotEntryCount ?? 0,
        description: t('Pages.Admin.CzechRanking.Cards.SnapshotEntriesHint'),
        icon: FileSpreadsheet,
      },
      {
        key: 'eventDatasets',
        title: t('Pages.Admin.CzechRanking.Cards.EventDatasets'),
        value: data?.summary.eventDatasetCount ?? 0,
        description: t('Pages.Admin.CzechRanking.Cards.EventDatasetsHint'),
        icon: RefreshCcw,
      },
      {
        key: 'eventResults',
        title: t('Pages.Admin.CzechRanking.Cards.EventResults'),
        value: data?.summary.eventResultCount ?? 0,
        description: t('Pages.Admin.CzechRanking.Cards.EventResultsHint'),
        icon: Database,
      },
    ],
    [data, t]
  );

  const resetUploadForm = () => {
    setUploadRankingType('FOREST');
    setUploadRankingCategory('M');
    setUploadValidForMonth(format(new Date(), 'yyyy-MM'));
    setUploadedFiles([]);
  };

  const invalidateRankingQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'czech-ranking'],
    });
  };

  const handleUploadSubmit = async () => {
    const selectedFile = uploadedFiles[0];
    if (!selectedFile) {
      toast({
        title: t('Pages.Admin.CzechRanking.UploadDialog.ValidationTitle'),
        description: t('Pages.Admin.CzechRanking.UploadDialog.MissingFile'),
        variant: 'warning',
      });
      return;
    }

    try {
      const result = await uploadMutation.mutateAsync({
        rankingType: uploadRankingType,
        rankingCategory: uploadRankingCategory,
        validForMonth: uploadValidForMonth,
        file: selectedFile.blob,
        fileName: selectedFile.name,
      });

      toast({
        title: t('Pages.Admin.CzechRanking.Toast.UploadSuccessTitle'),
        description: t(
          'Pages.Admin.CzechRanking.Toast.UploadSuccessDescription',
          {
            count: result.importedEntries,
          }
        ),
        variant: 'success',
      });

      await invalidateRankingQueries();
      setIsUploadDialogOpen(false);
      resetUploadForm();
    } catch (uploadError) {
      toast({
        title: t('Pages.Admin.CzechRanking.Toast.UploadErrorTitle'),
        description:
          uploadError instanceof Error
            ? uploadError.message
            : t('Pages.Admin.CzechRanking.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const handleSyncSubmit = async () => {
    try {
      const result = await syncMutation.mutateAsync(syncScope);

      toast({
        title: t('Pages.Admin.CzechRanking.Toast.SyncSuccessTitle'),
        description: t(
          'Pages.Admin.CzechRanking.Toast.SyncSuccessDescription',
          {
            count: result.syncedEvents,
          }
        ),
        variant: 'success',
      });

      await invalidateRankingQueries();
      setIsSyncDialogOpen(false);
    } catch (syncError) {
      toast({
        title: t('Pages.Admin.CzechRanking.Toast.SyncErrorTitle'),
        description:
          syncError instanceof Error
            ? syncError.message
            : t('Pages.Admin.CzechRanking.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const handleClearSnapshots = async () => {
    try {
      const result = await clearSnapshotsMutation.mutateAsync(
        snapshotClearTarget === 'ALL'
          ? undefined
          : snapshotClearTarget
            ? {
                rankingType: snapshotClearTarget.rankingType,
                rankingCategory: snapshotClearTarget.rankingCategory,
                validForMonth: toMonthInputValue(
                  snapshotClearTarget.validForMonth
                ),
              }
            : undefined
      );

      toast({
        title: t('Pages.Admin.CzechRanking.Toast.ClearSnapshotsSuccessTitle'),
        description: t(
          'Pages.Admin.CzechRanking.Toast.ClearSuccessDescription',
          {
            count: result.deletedCount,
          }
        ),
        variant: 'success',
      });

      await invalidateRankingQueries();
      setSnapshotClearTarget(null);
      if (selectedSnapshot && snapshotClearTarget !== null) {
        setSelectedSnapshot(null);
      }
    } catch (clearError) {
      toast({
        title: t('Pages.Admin.CzechRanking.Toast.ClearSnapshotsErrorTitle'),
        description:
          clearError instanceof Error
            ? clearError.message
            : t('Pages.Admin.CzechRanking.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const handleClearEventResults = async () => {
    try {
      const result = await clearEventResultsMutation.mutateAsync(
        eventResultsClearTarget === 'ALL'
          ? undefined
          : eventResultsClearTarget
            ? {
                externalEventId: eventResultsClearTarget.externalEventId,
                rankingType: eventResultsClearTarget.rankingType,
                rankingCategory: eventResultsClearTarget.rankingCategory,
              }
            : undefined
      );

      toast({
        title: t(
          'Pages.Admin.CzechRanking.Toast.ClearEventResultsSuccessTitle'
        ),
        description: t(
          'Pages.Admin.CzechRanking.Toast.ClearSuccessDescription',
          {
            count: result.deletedCount,
          }
        ),
        variant: 'success',
      });

      await invalidateRankingQueries();
      setEventResultsClearTarget(null);
      if (selectedEventDataset && eventResultsClearTarget !== null) {
        setSelectedEventDataset(null);
      }
    } catch (clearError) {
      toast({
        title: t('Pages.Admin.CzechRanking.Toast.ClearEventResultsErrorTitle'),
        description:
          clearError instanceof Error
            ? clearError.message
            : t('Pages.Admin.CzechRanking.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  return (
    <AdminPageLayout
      activeItem="ranking"
      breadcrumbs={[
        {
          label: t('Pages.Admin.Common.Zone'),
          to: PATHNAMES.adminDashboard().to,
        },
        { label: t('Pages.Admin.Navigation.CzechRanking') },
      ]}
    >
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="flex flex-col gap-4 px-4 lg:flex-row lg:items-start lg:justify-between lg:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('Pages.Admin.CzechRanking.Title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {t('Pages.Admin.CzechRanking.Description')}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setIsSyncDialogOpen(true)}
              className="gap-2"
            >
              <RefreshCcw className="h-4 w-4" />
              {t('Pages.Admin.CzechRanking.Actions.ForceSync')}
            </Button>
            <Button
              onClick={() => setIsUploadDialogOpen(true)}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {t('Pages.Admin.CzechRanking.Actions.UploadSnapshot')}
            </Button>
          </div>
        </section>

        {error ? (
          <section className="px-4 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>
                {t('Pages.Admin.CzechRanking.ErrorTitle')}
              </AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : String(error)}
              </AlertDescription>
            </Alert>
          </section>
        ) : null}

        <section className="grid auto-rows-min gap-4 px-4 md:grid-cols-2 xl:grid-cols-4 lg:px-6">
          {summaryCards.map(card => (
            <SummaryCard
              key={card.key}
              title={card.title}
              value={card.value}
              description={card.description}
              icon={card.icon}
            />
          ))}
        </section>

        <section className="px-4 lg:px-6">
          <Tabs
            value={tabValue}
            onValueChange={value =>
              setTabValue(value as 'snapshots' | 'eventResults')
            }
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="snapshots">
                {t('Pages.Admin.CzechRanking.Tabs.Snapshots')}
              </TabsTrigger>
              <TabsTrigger value="eventResults">
                {t('Pages.Admin.CzechRanking.Tabs.EventResults')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="snapshots">
              <AppDataTable
                data={data?.snapshotDatasets ?? []}
                isLoading={isLoading}
                error={error}
                columnCount={7}
                emptyStateText={t('Pages.Admin.Table.Empty')}
                renderToolbar={
                  <div className="flex w-full justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setSnapshotClearTarget('ALL')}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('Pages.Admin.CzechRanking.Actions.ClearAllSnapshots')}
                    </Button>
                  </div>
                }
                renderHeader={
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t(
                          'Pages.Admin.CzechRanking.SnapshotTable.ValidForMonth'
                        )}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.CzechRanking.SnapshotTable.Type')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.CzechRanking.SnapshotTable.Category')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.CzechRanking.SnapshotTable.Entries')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.CzechRanking.SnapshotTable.Leader')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.CzechRanking.SnapshotTable.UpdatedAt')}
                      </TableHead>
                      <TableHead className="text-right">
                        {t('Pages.Admin.CzechRanking.SnapshotTable.Actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={dataset => (
                  <TableRow
                    key={`${dataset.rankingType}-${dataset.rankingCategory}-${dataset.validForMonth}`}
                  >
                    <TableCell className="font-medium">
                      {formatMonth(dataset.validForMonth)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{dataset.rankingType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{dataset.rankingCategory}</Badge>
                    </TableCell>
                    <TableCell>{dataset.entriesCount}</TableCell>
                    <TableCell>{dataset.leaderName || '—'}</TableCell>
                    <TableCell>{formatDateTime(dataset.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSnapshot(dataset)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {t('Pages.Admin.CzechRanking.Actions.ViewData')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setSnapshotClearTarget(dataset)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('Pages.Admin.CzechRanking.Actions.Clear')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              />
            </TabsContent>

            <TabsContent value="eventResults">
              <AppDataTable
                data={data?.eventResultDatasets ?? []}
                isLoading={isLoading}
                error={error}
                columnCount={7}
                emptyStateText={t('Pages.Admin.Table.Empty')}
                renderToolbar={
                  <div className="flex w-full justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setEventResultsClearTarget('ALL')}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t(
                        'Pages.Admin.CzechRanking.Actions.ClearAllEventResults'
                      )}
                    </Button>
                  </div>
                }
                renderHeader={
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('Pages.Admin.CzechRanking.EventResultsTable.Event')}
                      </TableHead>
                      <TableHead>{t('Pages.Admin.Table.Date')}</TableHead>
                      <TableHead>
                        {t('Pages.Admin.CzechRanking.EventResultsTable.Type')}
                      </TableHead>
                      <TableHead>
                        {t(
                          'Pages.Admin.CzechRanking.EventResultsTable.Category'
                        )}
                      </TableHead>
                      <TableHead>
                        {t(
                          'Pages.Admin.CzechRanking.EventResultsTable.Results'
                        )}
                      </TableHead>
                      <TableHead>
                        {t(
                          'Pages.Admin.CzechRanking.EventResultsTable.SyncedAt'
                        )}
                      </TableHead>
                      <TableHead className="text-right">
                        {t(
                          'Pages.Admin.CzechRanking.EventResultsTable.Actions'
                        )}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={dataset => (
                  <TableRow
                    key={`${dataset.externalEventId}-${dataset.rankingType}-${dataset.rankingCategory}`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span>
                          {dataset.localEventName || dataset.externalEventId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ORIS ID: {dataset.externalEventId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(dataset.eventDate)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{dataset.rankingType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{dataset.rankingCategory}</Badge>
                    </TableCell>
                    <TableCell>{dataset.resultCount}</TableCell>
                    <TableCell>{formatDateTime(dataset.syncedAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {dataset.localEventId ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              {...PATHNAMES.eventDetail(dataset.localEventId)}
                            >
                              {t('Pages.Admin.CzechRanking.Actions.OpenEvent')}
                            </Link>
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedEventDataset(dataset)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {t('Pages.Admin.CzechRanking.Actions.ViewData')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setEventResultsClearTarget(dataset)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('Pages.Admin.CzechRanking.Actions.Clear')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <Dialog
        open={isUploadDialogOpen}
        onOpenChange={open => {
          setIsUploadDialogOpen(open);
          if (!open) {
            resetUploadForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('Pages.Admin.CzechRanking.UploadDialog.Title')}
            </DialogTitle>
            <DialogDescription>
              {t('Pages.Admin.CzechRanking.UploadDialog.Description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <FieldLabelWithHelp
                htmlFor="ranking-type"
                label={t('Pages.Admin.CzechRanking.UploadDialog.RankingType')}
                helpText={t(
                  'Pages.Admin.CzechRanking.UploadDialog.Help.RankingType'
                )}
              />
              <Select
                value={uploadRankingType}
                onValueChange={value =>
                  setUploadRankingType(value as CzechRankingType)
                }
              >
                <SelectTrigger id="ranking-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FOREST">FOREST</SelectItem>
                  <SelectItem value="SPRINT">SPRINT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <FieldLabelWithHelp
                htmlFor="ranking-category"
                label={t(
                  'Pages.Admin.CzechRanking.UploadDialog.RankingCategory'
                )}
                helpText={t(
                  'Pages.Admin.CzechRanking.UploadDialog.Help.RankingCategory'
                )}
              />
              <Select
                value={uploadRankingCategory}
                onValueChange={value =>
                  setUploadRankingCategory(value as CzechRankingCategory)
                }
              >
                <SelectTrigger id="ranking-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">M</SelectItem>
                  <SelectItem value="F">F</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <FieldLabelWithHelp
                htmlFor="valid-for-month"
                label={t('Pages.Admin.CzechRanking.UploadDialog.ValidForMonth')}
                helpText={t(
                  'Pages.Admin.CzechRanking.UploadDialog.Help.ValidForMonth'
                )}
              />
              <Input
                id="valid-for-month"
                type="month"
                value={uploadValidForMonth}
                onChange={event => setUploadValidForMonth(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabelWithHelp
              label={t('Pages.Admin.CzechRanking.UploadDialog.File')}
              helpText={t('Pages.Admin.CzechRanking.UploadDialog.Help.File')}
            />
            <DragDropContainer
              uploadedFiles={uploadedFiles}
              onUpload={files => setUploadedFiles(files.slice(0, 1))}
              onDelete={index =>
                setUploadedFiles(files =>
                  files.filter((_, itemIndex) => itemIndex !== index)
                )
              }
              count={1}
              formats={['csv', 'txt']}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadDialogOpen(false);
                resetUploadForm();
              }}
            >
              {t('Pages.Admin.CzechRanking.Actions.Cancel')}
            </Button>
            <Button
              onClick={() => void handleUploadSubmit()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending
                ? t('Pages.Admin.CzechRanking.Actions.Uploading')
                : t('Pages.Admin.CzechRanking.Actions.UploadSnapshot')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('Pages.Admin.CzechRanking.SyncDialog.Title')}
            </DialogTitle>
            <DialogDescription>
              {t('Pages.Admin.CzechRanking.SyncDialog.Description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="sync-scope">
              {t('Pages.Admin.CzechRanking.SyncDialog.Scope')}
            </Label>
            <Select
              value={syncScope}
              onValueChange={value =>
                setSyncScope(value as 'ALL' | CzechRankingType)
              }
            >
              <SelectTrigger id="sync-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  {t('Pages.Admin.CzechRanking.SyncDialog.ScopeAll')}
                </SelectItem>
                <SelectItem value="FOREST">
                  {t('Pages.Admin.CzechRanking.SyncDialog.ScopeForest')}
                </SelectItem>
                <SelectItem value="SPRINT">
                  {t('Pages.Admin.CzechRanking.SyncDialog.ScopeSprint')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsSyncDialogOpen(false)}
            >
              {t('Pages.Admin.CzechRanking.Actions.Cancel')}
            </Button>
            <ButtonWithSpinner
              onClick={() => void handleSyncSubmit()}
              isSubmitting={syncMutation.isPending}
            >
              {syncMutation.isPending
                ? t('Pages.Admin.CzechRanking.Actions.Syncing')
                : t('Pages.Admin.CzechRanking.Actions.ForceSync')}
            </ButtonWithSpinner>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedSnapshot != null}
        onOpenChange={open => {
          if (!open) {
            setSelectedSnapshot(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {t('Pages.Admin.CzechRanking.Detail.SnapshotTitle')}
            </DialogTitle>
            <DialogDescription>
              {selectedSnapshot
                ? t('Pages.Admin.CzechRanking.Detail.SnapshotDescription', {
                    month: formatMonth(selectedSnapshot.validForMonth),
                    rankingType: selectedSnapshot.rankingType,
                    rankingCategory: selectedSnapshot.rankingCategory,
                    count: snapshotDetailQuery.data?.dataset.entriesCount ?? 0,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>

          {snapshotDetailQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('Pages.Admin.CzechRanking.Detail.Loading')}
            </p>
          ) : snapshotDetailQuery.error ? (
            <Alert variant="destructive">
              <AlertTitle>
                {t('Pages.Admin.CzechRanking.ErrorTitle')}
              </AlertTitle>
              <AlertDescription>
                {snapshotDetailQuery.error instanceof Error
                  ? snapshotDetailQuery.error.message
                  : String(snapshotDetailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : snapshotDetailQuery.data ? (
            <SnapshotDetailTable items={snapshotDetailQuery.data.items} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedEventDataset != null}
        onOpenChange={open => {
          if (!open) {
            setSelectedEventDataset(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {t('Pages.Admin.CzechRanking.Detail.EventResultsTitle')}
            </DialogTitle>
            <DialogDescription>
              {selectedEventDataset
                ? t('Pages.Admin.CzechRanking.Detail.EventResultsDescription', {
                    event:
                      selectedEventDataset.localEventName ||
                      selectedEventDataset.externalEventId,
                    rankingType: selectedEventDataset.rankingType,
                    rankingCategory: selectedEventDataset.rankingCategory,
                    count: eventDetailQuery.data?.dataset.resultCount ?? 0,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>

          {eventDetailQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('Pages.Admin.CzechRanking.Detail.Loading')}
            </p>
          ) : eventDetailQuery.error ? (
            <Alert variant="destructive">
              <AlertTitle>
                {t('Pages.Admin.CzechRanking.ErrorTitle')}
              </AlertTitle>
              <AlertDescription>
                {eventDetailQuery.error instanceof Error
                  ? eventDetailQuery.error.message
                  : String(eventDetailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : eventDetailQuery.data ? (
            <EventResultDetailTable items={eventDetailQuery.data.items} />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={snapshotClearTarget != null}
        onOpenChange={open => {
          if (!open) {
            setSnapshotClearTarget(null);
          }
        }}
        title={t('Pages.Admin.CzechRanking.Confirm.ClearSnapshotsTitle')}
        description={
          snapshotClearTarget === 'ALL'
            ? t('Pages.Admin.CzechRanking.Confirm.ClearAllSnapshotsDescription')
            : t('Pages.Admin.CzechRanking.Confirm.ClearSnapshotDescription')
        }
        confirmText={t('Pages.Admin.CzechRanking.Actions.Clear')}
        cancelText={t('Pages.Admin.CzechRanking.Actions.Cancel')}
        variant="destructive"
        onConfirm={() => void handleClearSnapshots()}
      />

      <ConfirmDialog
        open={eventResultsClearTarget != null}
        onOpenChange={open => {
          if (!open) {
            setEventResultsClearTarget(null);
          }
        }}
        title={t('Pages.Admin.CzechRanking.Confirm.ClearEventResultsTitle')}
        description={
          eventResultsClearTarget === 'ALL'
            ? t(
                'Pages.Admin.CzechRanking.Confirm.ClearAllEventResultsDescription'
              )
            : t('Pages.Admin.CzechRanking.Confirm.ClearEventResultsDescription')
        }
        confirmText={t('Pages.Admin.CzechRanking.Actions.Clear')}
        cancelText={t('Pages.Admin.CzechRanking.Actions.Cancel')}
        variant="destructive"
        onConfirm={() => void handleClearEventResults()}
      />
    </AdminPageLayout>
  );
}
