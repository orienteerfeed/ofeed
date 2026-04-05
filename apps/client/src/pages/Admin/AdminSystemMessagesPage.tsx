import type {
  AdminSystemMessageItem,
  AdminSystemMessageUpsertInput,
  SystemMessageSeverity,
} from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Eye, EyeOff, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Input, Select, ToggleSwitch } from '@/components/atoms';
import { ConfirmDialog } from '@/components/molecules';
import { AppDataTable } from '@/components/organisms';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { PATHNAMES } from '@/lib/paths/pathnames';
import { AdminPageLayout } from '@/templates';
import { toast } from '@/utils';

import {
  useAdminSystemMessageCreateMutation,
  useAdminSystemMessageDeleteMutation,
  useAdminSystemMessageUpdateMutation,
  useAdminSystemMessagesQuery,
} from './admin.hooks';

type EditorState =
  | {
      mode: 'create';
      item: null;
    }
  | {
      mode: 'edit';
      item: AdminSystemMessageItem;
    };

type FormState = {
  title: string;
  message: string;
  severity: SystemMessageSeverity;
  expiresAt: string;
  published: boolean;
};

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return '—';
  }

  return format(new Date(value), 'dd.MM.yyyy HH:mm');
}

function toDateTimeLocalValue(value: string | Date | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toApiDateTime(value: string) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function createFormState(item?: AdminSystemMessageItem | null): FormState {
  return {
    title: item?.title ?? '',
    message: item?.message ?? '',
    severity: item?.severity ?? 'INFO',
    expiresAt: toDateTimeLocalValue(item?.expiresAt),
    published: item?.publishedAt != null,
  };
}

function getMessageStatus(message: AdminSystemMessageItem) {
  if (!message.publishedAt) {
    return 'draft' as const;
  }

  if (
    message.expiresAt &&
    new Date(message.expiresAt).getTime() <= Date.now()
  ) {
    return 'expired' as const;
  }

  return 'published' as const;
}

function getStatusBadgeVariant(status: ReturnType<typeof getMessageStatus>) {
  switch (status) {
    case 'published':
      return 'default' as const;
    case 'expired':
      return 'destructive' as const;
    case 'draft':
    default:
      return 'secondary' as const;
  }
}

function getSeverityBadgeVariant(severity: SystemMessageSeverity) {
  switch (severity) {
    case 'ERROR':
      return 'destructive' as const;
    case 'WARNING':
      return 'secondary' as const;
    case 'SUCCESS':
      return 'default' as const;
    case 'INFO':
    default:
      return 'outline' as const;
  }
}

export function AdminSystemMessagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useAdminSystemMessagesQuery();
  const createMutation = useAdminSystemMessageCreateMutation();
  const updateMutation = useAdminSystemMessageUpdateMutation();
  const deleteMutation = useAdminSystemMessageDeleteMutation();
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [formState, setFormState] = useState<FormState>(() =>
    createFormState()
  );
  const [deleteTarget, setDeleteTarget] =
    useState<AdminSystemMessageItem | null>(null);

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const severityOptions = (
    ['INFO', 'WARNING', 'ERROR', 'SUCCESS'] as const
  ).map(value => ({
    value,
    label: t(`Pages.Admin.SystemMessages.Severity.${value}`),
  }));

  const invalidateAdminQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin'],
    });
  };

  const closeEditor = () => {
    setEditorState(null);
    setFormState(createFormState());
  };

  const openCreateDialog = () => {
    setEditorState({
      mode: 'create',
      item: null,
    });
    setFormState(createFormState());
  };

  const openEditDialog = (item: AdminSystemMessageItem) => {
    setEditorState({
      mode: 'edit',
      item,
    });
    setFormState(createFormState(item));
  };

  const buildPayload = (): AdminSystemMessageUpsertInput => ({
    title: formState.title.trim() || null,
    message: formState.message.trim(),
    severity: formState.severity,
    expiresAt: toApiDateTime(formState.expiresAt),
    published: formState.published,
  });

  const handleSubmit = async () => {
    if (!editorState) {
      return;
    }

    const message = formState.message.trim();
    if (!message) {
      toast({
        title: t('Pages.Admin.SystemMessages.Toast.ValidationErrorTitle'),
        description: t('Pages.Admin.SystemMessages.Toast.MessageRequired'),
        variant: 'error',
      });
      return;
    }

    try {
      const payload = buildPayload();

      if (editorState.mode === 'create') {
        await createMutation.mutateAsync(payload);
        toast({
          title: t('Pages.Admin.SystemMessages.Toast.CreateSuccessTitle'),
          description: t(
            'Pages.Admin.SystemMessages.Toast.CreateSuccessDescription'
          ),
          variant: 'success',
        });
      } else {
        await updateMutation.mutateAsync({
          messageId: editorState.item.id,
          data: payload,
        });
        toast({
          title: t('Pages.Admin.SystemMessages.Toast.UpdateSuccessTitle'),
          description: t(
            'Pages.Admin.SystemMessages.Toast.UpdateSuccessDescription'
          ),
          variant: 'success',
        });
      }

      await invalidateAdminQueries();
      closeEditor();
    } catch (mutationError) {
      toast({
        title: t('Pages.Admin.SystemMessages.Toast.ActionErrorTitle'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Admin.SystemMessages.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const handleTogglePublished = async (item: AdminSystemMessageItem) => {
    const nextPublished = item.publishedAt == null;

    try {
      await updateMutation.mutateAsync({
        messageId: item.id,
        data: { published: nextPublished },
      });

      toast({
        title: nextPublished
          ? t('Pages.Admin.SystemMessages.Toast.PublishSuccessTitle')
          : t('Pages.Admin.SystemMessages.Toast.UnpublishSuccessTitle'),
        description: t(
          'Pages.Admin.SystemMessages.Toast.StatusSuccessDescription',
          {
            name: item.title || t('Pages.Admin.SystemMessages.Dialog.Untitled'),
          }
        ),
        variant: 'success',
      });

      await invalidateAdminQueries();
    } catch (mutationError) {
      toast({
        title: t('Pages.Admin.SystemMessages.Toast.ActionErrorTitle'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Admin.SystemMessages.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);

      toast({
        title: t('Pages.Admin.SystemMessages.Toast.DeleteSuccessTitle'),
        description: t(
          'Pages.Admin.SystemMessages.Toast.DeleteSuccessDescription',
          {
            name:
              deleteTarget.title ||
              t('Pages.Admin.SystemMessages.Dialog.Untitled'),
          }
        ),
        variant: 'success',
      });

      await invalidateAdminQueries();
      setDeleteTarget(null);
    } catch (mutationError) {
      toast({
        title: t('Pages.Admin.SystemMessages.Toast.ActionErrorTitle'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Admin.SystemMessages.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };

  return (
    <AdminPageLayout
      activeItem="systemMessages"
      breadcrumbs={[
        {
          label: t('Pages.Admin.Common.Zone'),
          to: PATHNAMES.adminDashboard().to,
        },
        { label: t('Pages.Admin.Navigation.SystemMessages') },
      ]}
    >
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="px-4 lg:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('Pages.Admin.SystemMessages.Title')}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t('Pages.Admin.SystemMessages.Description', {
              count: data?.total ?? 0,
            })}
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
              <Button
                className="gap-2"
                onClick={openCreateDialog}
                disabled={isSubmitting}
              >
                <Plus className="h-4 w-4" />
                {t('Pages.Admin.SystemMessages.Actions.Add')}
              </Button>
            }
            renderHeader={
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('Pages.Admin.SystemMessages.Table.TitleMessage')}
                  </TableHead>
                  <TableHead>{t('Pages.Admin.Table.Severity')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Status')}</TableHead>
                  <TableHead>
                    {t('Pages.Admin.SystemMessages.Table.PublishedAt')}
                  </TableHead>
                  <TableHead>{t('Pages.Admin.Table.ExpiresAt')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.UpdatedAt')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Actions')}</TableHead>
                </TableRow>
              </TableHeader>
            }
            renderRow={item => {
              const status = getMessageStatus(item);

              return (
                <TableRow key={item.id}>
                  <TableCell className="max-w-xl">
                    <div className="space-y-1">
                      <div className="font-medium">
                        {item.title ||
                          t('Pages.Admin.SystemMessages.Dialog.Untitled')}
                      </div>
                      <div className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                        {item.message}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSeverityBadgeVariant(item.severity)}>
                      {t(
                        `Pages.Admin.SystemMessages.Severity.${item.severity}`
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(status)}>
                      {t(
                        `Pages.Admin.SystemMessages.Status.${
                          status === 'draft'
                            ? 'Draft'
                            : status === 'expired'
                              ? 'Expired'
                              : 'Published'
                        }`
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(item.publishedAt)}</TableCell>
                  <TableCell>{formatDateTime(item.expiresAt)}</TableCell>
                  <TableCell>{formatDateTime(item.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={isSubmitting}
                        onClick={() => openEditDialog(item)}
                      >
                        <Pencil className="h-4 w-4" />
                        {t('Pages.Admin.SystemMessages.Actions.Edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={isSubmitting}
                        onClick={() => void handleTogglePublished(item)}
                      >
                        {item.publishedAt ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        {item.publishedAt
                          ? t('Pages.Admin.SystemMessages.Actions.Unpublish')
                          : t('Pages.Admin.SystemMessages.Actions.Publish')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        disabled={isSubmitting}
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('Pages.Admin.SystemMessages.Actions.Delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }}
          />
        </section>
      </div>

      <Dialog
        open={editorState !== null}
        onOpenChange={open => {
          if (!open) {
            closeEditor();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editorState?.mode === 'edit'
                ? t('Pages.Admin.SystemMessages.Dialog.EditTitle')
                : t('Pages.Admin.SystemMessages.Dialog.CreateTitle')}
            </DialogTitle>
            <DialogDescription>
              {editorState?.mode === 'edit'
                ? t('Pages.Admin.SystemMessages.Dialog.EditDescription')
                : t('Pages.Admin.SystemMessages.Dialog.CreateDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="system-message-title">
                {t('Pages.Admin.SystemMessages.Fields.Title')}
              </Label>
              <Input
                id="system-message-title"
                value={formState.title}
                onChange={event =>
                  setFormState(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system-message-severity">
                {t('Pages.Admin.SystemMessages.Fields.Severity')}
              </Label>
              <Select
                value={formState.severity}
                onValueChange={value =>
                  setFormState(current => ({
                    ...current,
                    severity: value as SystemMessageSeverity,
                  }))
                }
                options={severityOptions}
                placeholder={t('Pages.Admin.SystemMessages.Fields.Severity')}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system-message-message">
                {t('Pages.Admin.SystemMessages.Fields.Message')}
              </Label>
              <Textarea
                id="system-message-message"
                value={formState.message}
                onChange={event =>
                  setFormState(current => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
                rows={6}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system-message-expires-at">
                {t('Pages.Admin.SystemMessages.Fields.ExpiresAt')}
              </Label>
              <Input
                id="system-message-expires-at"
                type="datetime-local"
                value={formState.expiresAt}
                onChange={event =>
                  setFormState(current => ({
                    ...current,
                    expiresAt: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t('Pages.Admin.SystemMessages.Fields.ExpiresAtHelp')}
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="system-message-published">
                  {t('Pages.Admin.SystemMessages.Fields.Published')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('Pages.Admin.SystemMessages.Fields.PublishedHelp')}
                </p>
              </div>
              <ToggleSwitch
                id="system-message-published"
                checked={formState.published}
                onCheckedChange={checked =>
                  setFormState(current => ({
                    ...current,
                    published: checked,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeEditor}
              disabled={isSubmitting}
            >
              {t('Pages.Admin.SystemMessages.Actions.Cancel')}
            </Button>
            <Button
              className="gap-2"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              <Megaphone className="h-4 w-4" />
              {editorState?.mode === 'edit'
                ? t('Pages.Admin.SystemMessages.Actions.Save')
                : t('Pages.Admin.SystemMessages.Actions.Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title={t('Pages.Admin.SystemMessages.Confirm.DeleteTitle')}
        description={
          deleteTarget
            ? t('Pages.Admin.SystemMessages.Confirm.DeleteDescription', {
                name:
                  deleteTarget.title ||
                  t('Pages.Admin.SystemMessages.Dialog.Untitled'),
              })
            : ''
        }
        confirmText={t('Pages.Admin.SystemMessages.Actions.Delete')}
        cancelText={t('Pages.Admin.SystemMessages.Actions.Cancel')}
        variant="destructive"
        onConfirm={() => void handleDelete()}
      />
    </AdminPageLayout>
  );
}
