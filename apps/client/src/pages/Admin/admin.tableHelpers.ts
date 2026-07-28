import type { AdminEventListItem, AdminUserListItem } from '@repo/shared';

import type { AdminEventSortColumn } from '@/components/organisms/AdminEventsTableHeader';
import type { AdminUserSortColumn } from '@/components/organisms/AdminUsersTableHeader';

export function getEventSortValue(
  item: AdminEventListItem,
  column: AdminEventSortColumn
) {
  switch (column) {
    case 'name':
      return item.name.toLowerCase();
    case 'date':
      return new Date(item.date).getTime();
    case 'organizer':
      return (item.organizer ?? '').toLowerCase();
    case 'discipline':
      return item.discipline;
    case 'authorName':
      return (item.authorName ?? '').toLowerCase();
    case 'published':
      return item.published ? 1 : 0;
    case 'ranking':
      return item.ranking ? 1 : 0;
    default:
      return item.name.toLowerCase();
  }
}

export function getUserSortValue(
  item: AdminUserListItem,
  column: AdminUserSortColumn
) {
  switch (column) {
    case 'name':
      return `${item.lastname} ${item.firstname}`.toLowerCase();
    case 'email':
      return item.email.toLowerCase();
    case 'emailVerified':
      return item.emailVerifiedAt ? 1 : 0;
    case 'role':
      return item.role;
    case 'active':
      return item.active ? 1 : 0;
    case 'organisation':
      return (item.organisation ?? '').toLowerCase();
    case 'createdAt':
      return new Date(item.createdAt).getTime();
    default:
      return item.email.toLowerCase();
  }
}
