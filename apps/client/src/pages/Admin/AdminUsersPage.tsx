import type { AdminUserListItem } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Power, PowerOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '@/components/atoms';
import { ConfirmDialog } from '@/components/molecules';
import { useAuth } from '@/hooks/useAuth';
import {
  AppDataTable,
  AppPagination,
  AppRowsPerPage,
} from '@/components/organisms';
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
  useAdminUserActiveMutation,
  useAdminUserDeleteMutation,
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
  const [activeToggleTarget, setActiveToggleTarget] = useState<{
    user: AdminUserListItem;
    nextActive: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserListItem | null>(
    null
  );

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
            columnCount={7}
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
                    {user.firstname} {user.lastname}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={isCurrentUser}
                        onClick={() =>
                          setActiveToggleTarget({
                            user,
                            nextActive: !user.active,
                          })
                        }
                      >
                        {user.active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                        {user.active
                          ? t('Pages.Admin.Users.Actions.Deactivate')
                          : t('Pages.Admin.Users.Actions.Activate')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        disabled={isCurrentUser}
                        onClick={() => setDeleteTarget(user)}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('Pages.Admin.Users.Actions.Delete')}
                      </Button>
                    </div>
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
    </AdminPageLayout>
  );
}
