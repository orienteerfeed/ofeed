import type { AdminUserListItem } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { Mail, MoreHorizontal, Power, PowerOff, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, EmailVerifiedBadge } from '@/components/atoms';
import { ConfirmDialog } from '@/components/molecules';
import { useAuth } from '@/hooks/useAuth';
import {
  AdminEventsTableHeader,
  AdminUsersTableHeader,
  AppDataTable,
  AppPagination,
  AppRowsPerPage,
  type AdminEventSortColumn,
  type AdminEventTextFilterColumn,
  type AdminUserSortColumn,
  type AdminUserTextFilterColumn,
  type DateRangeValue,
} from '@/components/organisms';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { applyTimeToDate } from '@/lib/date';
import { PATHNAMES } from '@/lib/paths/pathnames';
import { AdminPageLayout } from '@/templates';
import { toast } from '@/utils';

import {
  useAdminEventsQuery,
  useAdminUserActiveMutation,
  useAdminUserDeleteMutation,
  useAdminUserRequestVerificationMutation,
  useAdminUsersQuery,
} from './admin.hooks';
import { getEventSortValue, getUserSortValue } from './admin.tableHelpers';

function formatDate(value: string | Date) {
  return format(new Date(value), 'dd.MM.yyyy');
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data, isLoading, error } = useAdminUsersQuery({
    page,
    limit: pageSize,
  });

  useEffect(() => {
    if (!data) return;
    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [data, page, pageSize]);

  const [userSortConfig, setUserSortConfig] = useState<{
    column: AdminUserSortColumn;
    direction: 'asc' | 'desc';
  }>({ column: 'createdAt', direction: 'desc' });
  const [userTextFilters, setUserTextFilters] = useState<
    Record<AdminUserTextFilterColumn, string>
  >({ name: '', email: '', organisation: '' });
  const [emailVerifiedFilters, setEmailVerifiedFilters] = useState<string[]>(
    []
  );
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [createdAtRange, setCreatedAtRange] = useState<DateRangeValue>({
    range: undefined,
    fromTime: '',
    toTime: '',
  });

  const handleUserSort = (column: AdminUserSortColumn) => {
    setUserSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  const updateUserTextFilter = (
    column: AdminUserTextFilterColumn,
    value: string
  ) => {
    setUserTextFilters(prev => ({ ...prev, [column]: value.toLowerCase() }));
  };

  const visibleUsers = useMemo(() => {
    const items = data?.items ?? [];

    const filtered = items.filter(user => {
      const fullName = `${user.firstname} ${user.lastname}`.toLowerCase();
      if (userTextFilters.name && !fullName.includes(userTextFilters.name)) {
        return false;
      }
      if (
        userTextFilters.email &&
        !user.email.toLowerCase().includes(userTextFilters.email)
      ) {
        return false;
      }
      if (
        userTextFilters.organisation &&
        !(user.organisation ?? '')
          .toLowerCase()
          .includes(userTextFilters.organisation)
      ) {
        return false;
      }
      if (
        emailVerifiedFilters.length > 0 &&
        !emailVerifiedFilters.includes(String(Boolean(user.emailVerifiedAt)))
      ) {
        return false;
      }
      if (roleFilters.length > 0 && !roleFilters.includes(user.role)) {
        return false;
      }
      if (
        activeFilters.length > 0 &&
        !activeFilters.includes(String(user.active))
      ) {
        return false;
      }
      if (createdAtRange.range?.from || createdAtRange.range?.to) {
        const itemTime = new Date(user.createdAt).getTime();
        const fromTime = createdAtRange.range?.from
          ? applyTimeToDate(
              createdAtRange.range.from,
              createdAtRange.fromTime || '00:00:00'
            ).getTime()
          : null;
        const toTime = createdAtRange.range?.to
          ? applyTimeToDate(
              createdAtRange.range.to,
              createdAtRange.toTime || '23:59:59'
            ).getTime()
          : null;
        if (fromTime && itemTime < fromTime) return false;
        if (toTime && itemTime > toTime) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const aValue = getUserSortValue(a, userSortConfig.column);
      const bValue = getUserSortValue(b, userSortConfig.column);

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return userSortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (aValue < bValue) return userSortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return userSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    data,
    userTextFilters,
    emailVerifiedFilters,
    roleFilters,
    activeFilters,
    createdAtRange,
    userSortConfig,
  ]);

  const updateUserActiveMutation = useAdminUserActiveMutation();
  const deleteUserMutation = useAdminUserDeleteMutation();
  const requestVerificationMutation = useAdminUserRequestVerificationMutation();
  const [activeToggleTarget, setActiveToggleTarget] = useState<{
    user: AdminUserListItem;
    nextActive: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserListItem | null>(
    null
  );
  const [eventsTarget, setEventsTarget] = useState<AdminUserListItem | null>(
    null
  );
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(25);
  const {
    data: eventsData,
    isLoading: eventsLoading,
    error: eventsError,
  } = useAdminEventsQuery({
    page: eventsPage,
    limit: eventsPageSize,
    authorId: eventsTarget?.id,
    enabled: eventsTarget !== null,
  });

  useEffect(() => {
    if (!eventsData) return;
    const totalPages = Math.max(1, Math.ceil(eventsData.total / eventsPageSize));
    if (eventsPage > totalPages) setEventsPage(totalPages);
  }, [eventsData, eventsPage, eventsPageSize]);

  const [eventSortConfig, setEventSortConfig] = useState<{
    column: AdminEventSortColumn;
    direction: 'asc' | 'desc';
  }>({ column: 'date', direction: 'desc' });
  const [eventTextFilters, setEventTextFilters] = useState<
    Record<AdminEventTextFilterColumn, string>
  >({ name: '', organizer: '', authorName: '' });
  const [eventDateRange, setEventDateRange] = useState<DateRangeValue>({
    range: undefined,
    fromTime: '',
    toTime: '',
  });
  const [eventDisciplineFilters, setEventDisciplineFilters] = useState<
    string[]
  >([]);
  const [eventPublishedFilters, setEventPublishedFilters] = useState<
    string[]
  >([]);
  const [eventRankingFilters, setEventRankingFilters] = useState<string[]>(
    []
  );

  const handleEventSort = (column: AdminEventSortColumn) => {
    setEventSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  const updateEventTextFilter = (
    column: AdminEventTextFilterColumn,
    value: string
  ) => {
    setEventTextFilters(prev => ({ ...prev, [column]: value.toLowerCase() }));
  };

  const visibleUserEvents = useMemo(() => {
    const items = eventsData?.items ?? [];

    const filtered = items.filter(event => {
      if (
        eventTextFilters.name &&
        !event.name.toLowerCase().includes(eventTextFilters.name)
      ) {
        return false;
      }
      if (
        eventTextFilters.organizer &&
        !(event.organizer ?? '')
          .toLowerCase()
          .includes(eventTextFilters.organizer)
      ) {
        return false;
      }
      if (
        eventDisciplineFilters.length > 0 &&
        !eventDisciplineFilters.includes(event.discipline)
      ) {
        return false;
      }
      if (
        eventPublishedFilters.length > 0 &&
        !eventPublishedFilters.includes(String(event.published))
      ) {
        return false;
      }
      if (
        eventRankingFilters.length > 0 &&
        !eventRankingFilters.includes(String(event.ranking))
      ) {
        return false;
      }
      if (eventDateRange.range?.from || eventDateRange.range?.to) {
        const itemTime = new Date(event.date).getTime();
        const fromTime = eventDateRange.range?.from
          ? applyTimeToDate(
              eventDateRange.range.from,
              eventDateRange.fromTime || '00:00:00'
            ).getTime()
          : null;
        const toTime = eventDateRange.range?.to
          ? applyTimeToDate(
              eventDateRange.range.to,
              eventDateRange.toTime || '23:59:59'
            ).getTime()
          : null;
        if (fromTime && itemTime < fromTime) return false;
        if (toTime && itemTime > toTime) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const aValue = getEventSortValue(a, eventSortConfig.column);
      const bValue = getEventSortValue(b, eventSortConfig.column);

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return eventSortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (aValue < bValue) return eventSortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return eventSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    eventsData,
    eventTextFilters,
    eventDisciplineFilters,
    eventPublishedFilters,
    eventRankingFilters,
    eventDateRange,
    eventSortConfig,
  ]);

  const invalidateAdminQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin'],
    });
  };

  const handleToggleUserActive = async () => {
    if (!activeToggleTarget) {
      return;
    }

    try {
      const result = await updateUserActiveMutation.mutateAsync({
        userId: activeToggleTarget.user.id,
        active: activeToggleTarget.nextActive,
      });

      toast({
        title: activeToggleTarget.nextActive
          ? t('Pages.Admin.Users.Toast.ActivateSuccessTitle')
          : t('Pages.Admin.Users.Toast.DeactivateSuccessTitle'),
        description: t('Pages.Admin.Users.Toast.StatusSuccessDescription', {
          name: `${result.user.firstname} ${result.user.lastname}`,
        }),
        variant: 'success',
      });

      await invalidateAdminQueries();
      setActiveToggleTarget(null);
    } catch (mutationError) {
      toast({
        title: activeToggleTarget.nextActive
          ? t('Pages.Admin.Users.Toast.ActivateErrorTitle')
          : t('Pages.Admin.Users.Toast.DeactivateErrorTitle'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Admin.Users.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      const result = await deleteUserMutation.mutateAsync(deleteTarget.id);

      toast({
        title: t('Pages.Admin.Users.Toast.DeleteSuccessTitle'),
        description: t('Pages.Admin.Users.Toast.DeleteSuccessDescription', {
          name: `${result.user.firstname} ${result.user.lastname}`,
        }),
        variant: 'success',
      });

      await invalidateAdminQueries();
      setDeleteTarget(null);
    } catch (mutationError) {
      toast({
        title: t('Pages.Admin.Users.Toast.DeleteErrorTitle'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Admin.Users.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const handleRequestVerification = async (user: AdminUserListItem) => {
    try {
      await requestVerificationMutation.mutateAsync(user.id);

      toast({
        title: t('Pages.Admin.Users.Toast.RequestVerificationSuccessTitle'),
        description: t(
          'Pages.Admin.Users.Toast.RequestVerificationSuccessDescription',
          {
            name: `${user.firstname} ${user.lastname}`,
          }
        ),
        variant: 'success',
      });

      await invalidateAdminQueries();
    } catch (mutationError) {
      toast({
        title: t('Pages.Admin.Users.Toast.RequestVerificationErrorTitle'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Admin.Users.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  return (
    <AdminPageLayout
      activeItem="users"
      breadcrumbs={[
        {
          label: t('Pages.Admin.Common.Zone'),
          to: PATHNAMES.adminDashboard().to,
        },
        { label: t('Pages.Admin.Navigation.Users') },
      ]}
    >
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="px-4 lg:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('Pages.Admin.Users.Title')}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t('Pages.Admin.Users.Description', { count: data?.total ?? 0 })}
          </p>
        </section>

        <section className="px-4 lg:px-6">
          <AppDataTable
            data={visibleUsers}
            isLoading={isLoading}
            error={error}
            columnCount={8}
            emptyStateText={t('Pages.Admin.Table.Empty')}
            renderToolbar={
              <AppRowsPerPage
                pageSize={pageSize}
                onPageSizeChange={size => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            }
            renderPagination={
              <AppPagination
                page={page}
                pageSize={pageSize}
                totalItems={data?.total ?? 0}
                onPageChange={setPage}
              />
            }
            renderHeader={
              <AdminUsersTableHeader
                sortConfig={userSortConfig}
                onSort={handleUserSort}
                textFilters={userTextFilters}
                onTextFilterChange={updateUserTextFilter}
                emailVerifiedFilters={emailVerifiedFilters}
                onEmailVerifiedFiltersChange={setEmailVerifiedFilters}
                roleFilters={roleFilters}
                onRoleFiltersChange={setRoleFilters}
                activeFilters={activeFilters}
                onActiveFiltersChange={setActiveFilters}
                createdAtRange={createdAtRange}
                onCreatedAtRangeChange={setCreatedAtRange}
              />
            }
            renderRow={user => {
              const isCurrentUser = currentUser?.id === user.id;

              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left transition-colors hover:text-primary hover:underline"
                      onClick={() => {
                        setEventsTarget(user);
                        setEventsPage(1);
                      }}
                    >
                      {user.firstname} {user.lastname}
                    </button>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <EmailVerifiedBadge
                      verifiedAt={user.emailVerifiedAt ?? null}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.role === 'ADMIN' ? 'default' : 'secondary'}
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.active ? 'default' : 'secondary'}>
                      {user.active
                        ? t('Pages.Admin.Table.Active')
                        : t('Pages.Admin.Table.Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.organisation || '—'}</TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <MoreHorizontal className="h-4 w-4" />
                          {t('Pages.Admin.Users.Actions.Menu')}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={isCurrentUser}
                          onSelect={() =>
                            setActiveToggleTarget({
                              user,
                              nextActive: !user.active,
                            })
                          }
                        >
                          {user.active ? (
                            <PowerOff className="mr-2 h-4 w-4" />
                          ) : (
                            <Power className="mr-2 h-4 w-4" />
                          )}
                          {user.active
                            ? t('Pages.Admin.Users.Actions.Deactivate')
                            : t('Pages.Admin.Users.Actions.Activate')}
                        </DropdownMenuItem>
                        {!user.emailVerifiedAt && (
                          <DropdownMenuItem
                            onSelect={() => handleRequestVerification(user)}
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            {t('Pages.Admin.Users.Actions.RequestVerification')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={isCurrentUser}
                          onSelect={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('Pages.Admin.Users.Actions.Delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            }}
          />
        </section>
      </div>

      <ConfirmDialog
        open={activeToggleTarget !== null}
        onOpenChange={open => {
          if (!open) {
            setActiveToggleTarget(null);
          }
        }}
        title={
          activeToggleTarget?.nextActive
            ? t('Pages.Admin.Users.Confirm.ActivateTitle')
            : t('Pages.Admin.Users.Confirm.DeactivateTitle')
        }
        description={
          activeToggleTarget
            ? activeToggleTarget.nextActive
              ? t('Pages.Admin.Users.Confirm.ActivateDescription', {
                  name: `${activeToggleTarget.user.firstname} ${activeToggleTarget.user.lastname}`,
                })
              : t('Pages.Admin.Users.Confirm.DeactivateDescription', {
                  name: `${activeToggleTarget.user.firstname} ${activeToggleTarget.user.lastname}`,
                })
            : ''
        }
        confirmText={
          activeToggleTarget?.nextActive
            ? t('Pages.Admin.Users.Actions.Activate')
            : t('Pages.Admin.Users.Actions.Deactivate')
        }
        cancelText={t('Pages.Admin.CzechRanking.Actions.Cancel')}
        onConfirm={() => void handleToggleUserActive()}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title={t('Pages.Admin.Users.Confirm.DeleteTitle')}
        description={
          deleteTarget
            ? t('Pages.Admin.Users.Confirm.DeleteDescription', {
                name: `${deleteTarget.firstname} ${deleteTarget.lastname}`,
              })
            : ''
        }
        confirmText={t('Pages.Admin.Users.Actions.Delete')}
        cancelText={t('Pages.Admin.CzechRanking.Actions.Cancel')}
        variant="destructive"
        onConfirm={() => void handleDeleteUser()}
      />

      <Dialog
        open={eventsTarget !== null}
        onOpenChange={open => {
          if (!open) {
            setEventsTarget(null);
          }
        }}
      >
        <DialogContent className="left-0 top-0 h-[100vh] w-[100vw] max-w-none translate-x-0 translate-y-0 rounded-none sm:left-1/2 sm:top-1/2 sm:h-auto sm:w-[95vw] sm:max-w-4xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg max-h-[100vh] sm:max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {eventsTarget &&
                t('Pages.Admin.Users.EventsDialog.Title', {
                  name: `${eventsTarget.firstname} ${eventsTarget.lastname}`,
                })}
            </DialogTitle>
            <DialogDescription>
              {t('Pages.Admin.Users.EventsDialog.Description')}
            </DialogDescription>
          </DialogHeader>

          <AppDataTable
            data={visibleUserEvents}
            isLoading={eventsLoading}
            error={eventsError}
            columnCount={6}
            emptyStateText={t('Pages.Admin.Users.EventsDialog.Empty')}
            renderToolbar={
              <AppRowsPerPage
                pageSize={eventsPageSize}
                onPageSizeChange={size => {
                  setEventsPageSize(size);
                  setEventsPage(1);
                }}
              />
            }
            renderPagination={
              <AppPagination
                page={eventsPage}
                pageSize={eventsPageSize}
                totalItems={eventsData?.total ?? 0}
                onPageChange={setEventsPage}
              />
            }
            renderHeader={
              <AdminEventsTableHeader
                sortConfig={eventSortConfig}
                onSort={handleEventSort}
                textFilters={eventTextFilters}
                onTextFilterChange={updateEventTextFilter}
                dateRange={eventDateRange}
                onDateRangeChange={setEventDateRange}
                disciplineFilters={eventDisciplineFilters}
                onDisciplineFiltersChange={setEventDisciplineFilters}
                publishedFilters={eventPublishedFilters}
                onPublishedFiltersChange={setEventPublishedFilters}
                rankingFilters={eventRankingFilters}
                onRankingFiltersChange={setEventRankingFilters}
                showOwner={false}
              />
            }
            renderRow={event => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">
                  <Link
                    {...PATHNAMES.eventDetail(event.id)}
                    className="transition-colors hover:text-primary"
                  >
                    {event.name}
                  </Link>
                </TableCell>
                <TableCell>{formatDate(event.date)}</TableCell>
                <TableCell>{event.organizer || '—'}</TableCell>
                <TableCell>
                  {t(`Pages.Event.Form.DisciplineOptions.${event.discipline}`)}
                </TableCell>
                <TableCell>
                  <Badge variant={event.published ? 'default' : 'secondary'}>
                    {event.published
                      ? t('Pages.Admin.Table.Yes')
                      : t('Pages.Admin.Table.No')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={event.ranking ? 'default' : 'secondary'}>
                    {event.ranking
                      ? t('Pages.Admin.Table.Yes')
                      : t('Pages.Admin.Table.No')}
                  </Badge>
                </TableCell>
              </TableRow>
            )}
          />
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
