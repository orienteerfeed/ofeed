import type {
  AdminClubListItem,
  AdminClubSyncStateItem,
  AdminRegistrationListItem,
  AdminRegistrationSyncStateItem,
  SyncStatus,
} from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { RefreshCcw, Users2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '@/components/atoms';
import { ButtonWithSpinner, Tabs } from '@/components/molecules';
import { AppDataTable, AppPagination, AppRowsPerPage } from '@/components/organisms';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PATHNAMES } from '@/lib/paths/pathnames';
import { AdminPageLayout } from '@/templates';
import { toast } from '@/utils';

import {
  useAdminRegistrationClubsQuery,
  useAdminRegistrationOrisSyncMutation,
  useAdminRegistrationsQuery,
  useAdminRegistrationSyncStatusQuery,
} from './admin.hooks';

const SEARCH_DEBOUNCE_MS = 250;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

function getSyncStatusBadgeVariant(status: SyncStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'default' as const;
    case 'ERROR':
      return 'destructive' as const;
    case 'PENDING':
    default:
      return 'secondary' as const;
  }
}

function formatDateTime(value: string | Date) {
  return format(new Date(value), 'dd.MM.yyyy HH:mm');
}

function SyncStatusCard({
  title,
  state,
}: {
  title: string;
  state: AdminRegistrationSyncStateItem | AdminClubSyncStateItem | undefined;
}) {
  const { t } = useTranslation();

  return (
    <Card className="border-border/70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {state && (
          <Badge variant={getSyncStatusBadgeVariant(state.lastStatus)}>
            {t(`Pages.Admin.Registrations.Status.${state.lastStatus}`)}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {state?.lastSuccessfulSyncAt
            ? t('Pages.Admin.Registrations.LastSuccess', {
                date: formatDateTime(state.lastSuccessfulSyncAt),
              })
            : t('Pages.Admin.Registrations.NeverSynced')}
        </p>
        {state?.recordCount != null && (
          <p className="text-sm font-medium">
            {t('Pages.Admin.Registrations.RecordCount', {
              count: state.recordCount,
            })}
          </p>
        )}
        {state?.lastStatus === 'ERROR' && state.lastError && (
          <Alert variant="destructive">
            <AlertTitle>
              {t('Pages.Admin.Registrations.SyncErrorTitle')}
            </AlertTitle>
            <AlertDescription>{state.lastError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminRegistrationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: syncStatus } = useAdminRegistrationSyncStatusQuery();

  const [registrationPage, setRegistrationPage] = useState(1);
  const [registrationPageSize, setRegistrationPageSize] = useState(25);
  const [registrationSearch, setRegistrationSearch] = useState('');
  const debouncedRegistrationSearch = useDebouncedValue(
    registrationSearch,
    SEARCH_DEBOUNCE_MS
  );

  const [clubPage, setClubPage] = useState(1);
  const [clubPageSize, setClubPageSize] = useState(25);
  const [clubSearch, setClubSearch] = useState('');
  const debouncedClubSearch = useDebouncedValue(clubSearch, SEARCH_DEBOUNCE_MS);

  const {
    data: registrationsData,
    isLoading: isRegistrationsLoading,
    error: registrationsError,
  } = useAdminRegistrationsQuery({
    page: registrationPage,
    limit: registrationPageSize,
    ...(debouncedRegistrationSearch ? { q: debouncedRegistrationSearch } : {}),
  });

  const {
    data: clubsData,
    isLoading: isClubsLoading,
    error: clubsError,
  } = useAdminRegistrationClubsQuery({
    page: clubPage,
    limit: clubPageSize,
    ...(debouncedClubSearch ? { q: debouncedClubSearch } : {}),
  });

  useEffect(() => {
    if (!registrationsData) return;
    const totalPages = Math.max(
      1,
      Math.ceil(registrationsData.total / registrationPageSize)
    );
    if (registrationPage > totalPages) setRegistrationPage(totalPages);
  }, [registrationsData, registrationPage, registrationPageSize]);

  useEffect(() => {
    if (!clubsData) return;
    const totalPages = Math.max(1, Math.ceil(clubsData.total / clubPageSize));
    if (clubPage > totalPages) setClubPage(totalPages);
  }, [clubsData, clubPage, clubPageSize]);

  const syncMutation = useAdminRegistrationOrisSyncMutation();
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [syncScope, setSyncScope] = useState<'ALL' | 'REGISTRATIONS' | 'CLUBS'>(
    'ALL'
  );

  const invalidateRegistrationQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'registrations'] });
  };

  const handleSyncSubmit = async () => {
    try {
      const result = await syncMutation.mutateAsync({
        scope: syncScope,
        sport: 'OB',
      });

      toast({
        title: t('Pages.Admin.Registrations.Toast.SyncSuccessTitle'),
        description: t(
          'Pages.Admin.Registrations.Toast.SyncSuccessDescription',
          {
            registrations: result.registrationsSynced ?? 0,
            clubs: result.clubsSynced ?? 0,
          }
        ),
        variant: 'success',
      });

      await invalidateRegistrationQueries();
      setIsSyncDialogOpen(false);
    } catch (syncError) {
      toast({
        title: t('Pages.Admin.Registrations.Toast.SyncErrorTitle'),
        description:
          syncError instanceof Error
            ? syncError.message
            : t('Pages.Admin.Registrations.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const registrationSyncState = syncStatus?.registrations[0];
  const clubSyncState = syncStatus?.clubs ?? undefined;

  return (
    <AdminPageLayout
      activeItem="registrations"
      breadcrumbs={[
        { label: t('Pages.Admin.Common.Zone'), to: PATHNAMES.adminDashboard().to },
        { label: t('Pages.Admin.Navigation.Registrations') },
      ]}
    >
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="flex flex-col gap-4 px-4 lg:flex-row lg:items-start lg:justify-between lg:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('Pages.Admin.Registrations.Title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {t('Pages.Admin.Registrations.Description')}
            </p>
          </div>
          <Button onClick={() => setIsSyncDialogOpen(true)} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {t('Pages.Admin.Registrations.Actions.ForceSync')}
          </Button>
        </section>

        <section className="grid auto-rows-min gap-4 px-4 md:grid-cols-2 lg:px-6">
          <SyncStatusCard
            title={t('Pages.Admin.Registrations.RegistrationsCard')}
            state={registrationSyncState}
          />
          <SyncStatusCard
            title={t('Pages.Admin.Registrations.ClubsCard')}
            state={clubSyncState}
          />
        </section>

        <section className="px-4 lg:px-6">
          <Tabs
            tabs={[
              {
                value: 'registrations',
                label: (
                  <span className="flex items-center gap-2">
                    <Users2 className="h-4 w-4" />
                    {t('Pages.Admin.Registrations.Tabs.Registrations')}
                  </span>
                ),
              },
              {
                value: 'clubs',
                label: t('Pages.Admin.Registrations.Tabs.Clubs'),
              },
            ]}
            defaultValue="registrations"
          >
            <div className="space-y-4">
              <Input
                value={registrationSearch}
                onChange={event => {
                  setRegistrationSearch(event.target.value);
                  setRegistrationPage(1);
                }}
                placeholder={t('Pages.Admin.Registrations.SearchPlaceholder')}
                className="max-w-sm"
              />
              <AppDataTable
                data={registrationsData?.items ?? []}
                isLoading={isRegistrationsLoading}
                error={registrationsError}
                columnCount={6}
                emptyStateText={t('Pages.Admin.Table.Empty')}
                renderToolbar={
                  <AppRowsPerPage
                    pageSize={registrationPageSize}
                    onPageSizeChange={size => {
                      setRegistrationPageSize(size);
                      setRegistrationPage(1);
                    }}
                  />
                }
                renderPagination={
                  <AppPagination
                    page={registrationPage}
                    pageSize={registrationPageSize}
                    totalItems={registrationsData?.total ?? 0}
                    onPageChange={setRegistrationPage}
                  />
                }
                renderHeader={
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.Registration')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.Name')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.Organisation')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.BirthYear')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.Source')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.SyncedAt')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={(item: AdminRegistrationListItem) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">
                      {item.registration}
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.firstname} {item.lastname}
                    </TableCell>
                    <TableCell>{item.organisation ?? '—'}</TableCell>
                    <TableCell>{item.birthYear ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.source}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(item.syncedAt)}</TableCell>
                  </TableRow>
                )}
              />
            </div>

            <div className="space-y-4">
              <Input
                value={clubSearch}
                onChange={event => {
                  setClubSearch(event.target.value);
                  setClubPage(1);
                }}
                placeholder={t('Pages.Admin.Registrations.ClubSearchPlaceholder')}
                className="max-w-sm"
              />
              <AppDataTable
                data={clubsData?.items ?? []}
                isLoading={isClubsLoading}
                error={clubsError}
                columnCount={4}
                emptyStateText={t('Pages.Admin.Table.Empty')}
                renderToolbar={
                  <AppRowsPerPage
                    pageSize={clubPageSize}
                    onPageSizeChange={size => {
                      setClubPageSize(size);
                      setClubPage(1);
                    }}
                  />
                }
                renderPagination={
                  <AppPagination
                    page={clubPage}
                    pageSize={clubPageSize}
                    totalItems={clubsData?.total ?? 0}
                    onPageChange={setClubPage}
                  />
                }
                renderHeader={
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.ClubName')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.ClubAbbr')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.Source')}
                      </TableHead>
                      <TableHead>
                        {t('Pages.Admin.Registrations.Table.SyncedAt')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={(club: AdminClubListItem) => (
                  <TableRow key={club.id}>
                    <TableCell className="font-medium">{club.name}</TableCell>
                    <TableCell className="font-mono">{club.abbr}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{club.source}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(club.syncedAt)}</TableCell>
                  </TableRow>
                )}
              />
            </div>
          </Tabs>
        </section>
      </div>

      <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('Pages.Admin.Registrations.SyncDialog.Title')}
            </DialogTitle>
            <DialogDescription>
              {t('Pages.Admin.Registrations.SyncDialog.Description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="registration-sync-scope">
              {t('Pages.Admin.Registrations.SyncDialog.Scope')}
            </Label>
            <Select
              value={syncScope}
              onValueChange={value =>
                setSyncScope(value as 'ALL' | 'REGISTRATIONS' | 'CLUBS')
              }
            >
              <SelectTrigger id="registration-sync-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  {t('Pages.Admin.Registrations.SyncDialog.ScopeAll')}
                </SelectItem>
                <SelectItem value="REGISTRATIONS">
                  {t('Pages.Admin.Registrations.SyncDialog.ScopeRegistrations')}
                </SelectItem>
                <SelectItem value="CLUBS">
                  {t('Pages.Admin.Registrations.SyncDialog.ScopeClubs')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsSyncDialogOpen(false)}>
              {t('Pages.Admin.Registrations.Actions.Cancel')}
            </Button>
            <ButtonWithSpinner
              onClick={() => void handleSyncSubmit()}
              isSubmitting={syncMutation.isPending}
            >
              {syncMutation.isPending
                ? t('Pages.Admin.Registrations.Actions.Syncing')
                : t('Pages.Admin.Registrations.Actions.ForceSync')}
            </ButtonWithSpinner>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
