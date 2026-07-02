import { Input } from '@/components/atoms';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AppDateRangeFilter,
  AppMultiSelectFilter,
  type DateRangeValue,
} from './AppTableFilters';
import { AppTableHeader, type AppTableColumn } from './AppTableHeader';

export type AdminUserSortColumn =
  | 'name'
  | 'email'
  | 'emailVerified'
  | 'role'
  | 'active'
  | 'organisation'
  | 'createdAt';

export type AdminUserColumnId = AdminUserSortColumn | 'actions';

export type AdminUserTextFilterColumn = 'name' | 'email' | 'organisation';

export type AdminUsersTableHeaderProps = {
  sortConfig: { column: AdminUserSortColumn; direction: 'asc' | 'desc' };
  onSort: (column: AdminUserSortColumn) => void;
  textFilters: Record<AdminUserTextFilterColumn, string>;
  onTextFilterChange: (
    column: AdminUserTextFilterColumn,
    value: string
  ) => void;
  emailVerifiedFilters: string[];
  onEmailVerifiedFiltersChange: (next: string[]) => void;
  roleFilters: string[];
  onRoleFiltersChange: (next: string[]) => void;
  activeFilters: string[];
  onActiveFiltersChange: (next: string[]) => void;
  createdAtRange: DateRangeValue;
  onCreatedAtRangeChange: (next: DateRangeValue) => void;
};

export const AdminUsersTableHeader = ({
  sortConfig,
  onSort,
  textFilters,
  onTextFilterChange,
  emailVerifiedFilters,
  onEmailVerifiedFiltersChange,
  roleFilters,
  onRoleFiltersChange,
  activeFilters,
  onActiveFiltersChange,
  createdAtRange,
  onCreatedAtRangeChange,
}: AdminUsersTableHeaderProps) => {
  const { t } = useTranslation();

  const booleanOptions = useMemo(
    () => [
      { value: 'true', label: t('Pages.Admin.Table.Yes') },
      { value: 'false', label: t('Pages.Admin.Table.No') },
    ],
    [t]
  );

  const roleOptions = useMemo(
    () => [
      { value: 'USER', label: 'USER' },
      { value: 'ADMIN', label: 'ADMIN' },
    ],
    []
  );

  const activeOptions = useMemo(
    () => [
      { value: 'true', label: t('Pages.Admin.Table.Active') },
      { value: 'false', label: t('Pages.Admin.Table.Inactive') },
    ],
    [t]
  );

  const selectedCountLabel = (count: number) =>
    t('Pages.Event.Report.Filters.SelectedCount', { count });
  const clearLabel = t('Pages.Event.Report.Filters.ClearSelection');

  const columns: AppTableColumn<AdminUserColumnId>[] = [
    {
      id: 'name',
      label: t('Pages.Admin.Table.Name'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Admin.Table.Filters.NamePlaceholder')}
          value={textFilters.name}
          onChange={event => onTextFilterChange('name', event.target.value)}
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'email',
      label: t('Pages.Admin.Table.Email'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Admin.Table.Filters.EmailPlaceholder')}
          value={textFilters.email}
          onChange={event => onTextFilterChange('email', event.target.value)}
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'emailVerified',
      label: t('Pages.Admin.Table.EmailVerified'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t(
            'Pages.Admin.Table.Filters.EmailVerifiedPlaceholder'
          )}
          options={booleanOptions}
          selected={emailVerifiedFilters}
          onChange={onEmailVerifiedFiltersChange}
          selectedCountLabel={selectedCountLabel}
          clearLabel={clearLabel}
        />
      ),
    },
    {
      id: 'role',
      label: t('Pages.Admin.Table.Role'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t('Pages.Admin.Table.Filters.RolePlaceholder')}
          options={roleOptions}
          selected={roleFilters}
          onChange={onRoleFiltersChange}
          selectedCountLabel={selectedCountLabel}
          clearLabel={clearLabel}
        />
      ),
    },
    {
      id: 'active',
      label: t('Pages.Admin.Table.Status'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t('Pages.Admin.Table.Filters.StatusPlaceholder')}
          options={activeOptions}
          selected={activeFilters}
          onChange={onActiveFiltersChange}
          selectedCountLabel={selectedCountLabel}
          clearLabel={clearLabel}
        />
      ),
    },
    {
      id: 'organisation',
      label: t('Pages.Admin.Table.Organization'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Admin.Table.Filters.OrganizationPlaceholder')}
          value={textFilters.organisation}
          onChange={event =>
            onTextFilterChange('organisation', event.target.value)
          }
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'createdAt',
      label: t('Pages.Admin.Table.CreatedAt'),
      sortable: true,
      filter: (
        <AppDateRangeFilter
          value={createdAtRange}
          onChange={onCreatedAtRangeChange}
          label={t('Pages.Event.Report.Filters.DateRange')}
          fromLabel={t('Pages.Event.Report.Filters.DateFrom')}
          toLabel={t('Pages.Event.Report.Filters.DateTo')}
          clearLabel={clearLabel}
          timeFromLabel={t('Pages.Event.Report.Filters.TimeFrom')}
          timeToLabel={t('Pages.Event.Report.Filters.TimeTo')}
        />
      ),
    },
    {
      id: 'actions',
      label: t('Pages.Admin.Table.Actions'),
    },
  ];

  const columnOrder = columns.map(column => column.id);

  return (
    <AppTableHeader
      columns={columns}
      columnOrder={columnOrder}
      sortConfig={sortConfig}
      onSort={column => {
        if (column === 'actions') return;
        onSort(column);
      }}
    />
  );
};
