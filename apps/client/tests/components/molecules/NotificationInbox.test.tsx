import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPage } from '@repo/shared';
import en from '@/i18n/locales/en/translation.json';
import { NotificationInbox } from '@/components/molecules/NotificationInbox';

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  markRead: vi.fn(),
  markAll: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => state.navigate,
}));
vi.mock('@/hooks/useNotifications', () => ({
  useMarkAsRead: () => [state.markRead, { loading: false }],
  useMarkAllAsRead: () => [state.markAll, { loading: false }],
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options: Record<string, unknown> = {}) => {
      const dictionary: Record<string, unknown> = key.startsWith('Favorites.')
        ? en.Favorites
        : en.Notifications;
      const value = dictionary[key.split('.')[1]!];
      let text = typeof value === 'string' ? value : key;
      for (const [name, value] of Object.entries(options))
        text = text.replaceAll(`{{${name}}}`, String(value));
      return text;
    },
    i18n: { resolvedLanguage: 'en' },
  }),
}));
const page: NotificationPage = {
  notifications: [
    {
      id: 'message',
      kind: 'ENTRY_ORDER_RECEIVED',
      eventId: 'race',
      entryId: 'order',
      eventName: 'Family race',
      itemCount: 3,
      amount: null,
      currency: null,
      method: null,
      createdAt: '2026-11-12T10:00:00Z',
      readAt: null,
    },
  ],
  unreadCount: 1,
  endCursor: 'cursor',
  hasNextPage: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.markRead.mockResolvedValue({ data: { markNotificationRead: true } });
  state.markAll.mockResolvedValue({ data: { markAllNotificationsRead: true } });
});
describe('notification inbox', () => {
  it('opens competitor updates in favorites without treating them as a payment', async () => {
    render(
      <NotificationInbox
        data={{
          ...page,
          notifications: [
            {
              ...page.notifications[0]!,
              kind: 'COMPETITOR_RESULT_CHANGED',
              entryId: null,
              competitorId: 123,
              competitorName: 'Runner Test',
              status: 'Active',
              raceTime: 60,
            },
          ],
        }}
        loading={false}
        failed={false}
        retry={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Result changed/ }));
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({
        to: '/events/$eventId',
        params: { eventId: 'race' },
        search: { tab: 'favorites' },
      })
    );
    expect(screen.getByText(/Runner Test/)).toBeInTheDocument();
    expect(screen.queryByText(/Payment received/)).toBeNull();
  });
  it('shows loading, retryable errors and an empty inbox', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <NotificationInbox
        data={undefined}
        loading
        failed={false}
        retry={retry}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading notifications'
    );
    rerender(
      <NotificationInbox
        data={undefined}
        loading={false}
        failed
        retry={retry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(
      <NotificationInbox
        data={{ ...page, notifications: [], unreadCount: 0 }}
        loading={false}
        failed={false}
        retry={retry}
      />
    );
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });
  it('marks an unread message before navigating to its order', async () => {
    render(
      <NotificationInbox
        data={page}
        loading={false}
        failed={false}
        retry={vi.fn()}
      />
    );
    expect(screen.getByText('Competitors: 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New entry order/ }));
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({
        to: '/events/$eventId/entries/$entryId',
        params: { eventId: 'race', entryId: 'order' },
      })
    );
    expect(state.markRead).toHaveBeenCalledWith({
      variables: { id: 'message' },
    });
  });
  it('opens a read message without another read mutation and supports mark-all', async () => {
    render(
      <NotificationInbox
        data={{
          ...page,
          notifications: [
            { ...page.notifications[0]!, readAt: '2026-11-12T10:01:00Z' },
          ],
        }}
        loading={false}
        failed={false}
        retry={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /New entry order/ }));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledOnce());
    expect(state.markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(state.markAll).toHaveBeenCalledOnce();
  });
  it('keeps the message accessible and reports a failed mutation', async () => {
    state.markRead.mockRejectedValue(new Error('offline'));
    render(
      <NotificationInbox
        data={page}
        loading={false}
        failed={false}
        retry={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /New entry order/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The action failed'
    );
    expect(state.navigate).not.toHaveBeenCalled();
  });
  it('formats received payment amounts in the current locale', () => {
    render(
      <NotificationInbox
        data={{
          ...page,
          notifications: [
            {
              ...page.notifications[0]!,
              kind: 'ENTRY_PAYMENT_RECEIVED',
              amount: '100.29',
              currency: 'CZK',
              method: 'CASH',
              itemCount: null,
            },
          ],
        }}
        loading={false}
        failed={false}
        retry={vi.fn()}
      />
    );
    expect(screen.getByText(/100\.29.*Cash/)).toBeInTheDocument();
    expect(screen.getByText('Payment received')).toBeInTheDocument();
  });
});
