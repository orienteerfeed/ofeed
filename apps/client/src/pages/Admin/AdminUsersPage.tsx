import type { AdminUserListItem } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { Mail, MoreHorizontal, Power, PowerOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, EmailVerifiedBadge } from '@/components/atoms';
import { ConfirmDialog } from '@/components/molecules';
import { useAuth } from '@/hooks/useAuth';
import {
  AppDataTable,
  AppPagination,
  AppRowsPerPage,
} from '@/components/organisms';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
            data={data?.items ?? []}
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
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Pages.Admin.Table.Name')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Email')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.EmailVerified')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Role')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Status')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Organization')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.CreatedAt')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Actions')}</TableHead>
                </TableRow>
              </TableHeader>
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
            data={eventsData?.items ?? []}
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
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Pages.Admin.Table.Event')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Date')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Organizer')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Discipline')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Published')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Ranking')}</TableHead>
                </TableRow>
              </TableHeader>
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
