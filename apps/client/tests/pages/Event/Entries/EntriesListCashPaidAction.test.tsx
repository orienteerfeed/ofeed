import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  paidUpdate: vi.fn(),
  refreshPayments: vi.fn(),
  refetch: vi.fn(),
  entry: {
    id: 'entry',
    eventId: 'event',
    status: 'RECEIVED',
    paid: false,
    paymentCount: 0,
    paymentMethod: 'CASH',
    paymentReference: '2600000001',
    userId: null,
    contactEmail: 'cash@test.invalid',
    contactFirstname: 'Test',
    contactLastname: 'Cash',
    totalAmount: 250,
    currency: 'CZK',
    createdAt: '2026-11-01T08:00:00Z',
    updatedAt: '2026-11-01T08:00:00Z',
    items: [],
  },
}));
vi.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { entryOrdersByEvent: [state.entry] },
    loading: false,
    refetch: state.refetch,
  }),
  useMutation: (doc: { loc?: { source: { body: string } } }) => [
    doc.loc?.source.body.includes('mutation EntryOrderPaidUpdate')
      ? state.paidUpdate
      : vi.fn(),
  ],
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ eventId: 'event' }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks', () => ({ useEvent: () => ({ event: { name: 'Race' } }) }));
vi.mock('@/templates/MainPageLayout', () => ({
  MainPageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/pages/Event/Entries/entries.hooks', () => ({
  useRefreshEntryPaymentQueries: () => state.refreshPayments,
}));
vi.mock('@/stores/auth/session-manager', () => ({
  getDeviceMetadata: () => ({ deviceId: 'browser-device' }),
}));
vi.mock('@/pages/Event/Entries/EntryItemsTable', () => ({
  EntryItemsTable: () => null,
}));
vi.mock('@/utils', () => ({ toast: vi.fn() }));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));
import { EventEntriesManagePage } from '@/pages/Event/Entries/EventEntriesManagePage';
const prefix = 'Pages.Event.EntriesManage.Actions.';
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  state.entry.paid = false;
  state.entry.paymentCount = 0;
  state.paidUpdate.mockImplementation(async () => {
    state.entry.paid = true;
    state.entry.paymentCount = 1;
    return {};
  });
  state.refreshPayments.mockResolvedValue(undefined);
});
describe('entry-list cash actions', () => {
  it('records new cash confirmation with the desk ID and refreshes the payment report', async () => {
    window.localStorage.setItem(
      'orienteerfeed:entry-payments:device-id',
      'desk-1'
    );
    render(<EventEntriesManagePage />);
    fireEvent.click(
      await screen.findByRole('button', { name: prefix + 'MarkCashPaid' })
    );
    await waitFor(() =>
      expect(state.paidUpdate).toHaveBeenCalledWith({
        variables: { entryId: 'entry', paid: true, deviceId: 'desk-1' },
      })
    );
    await waitFor(() =>
      expect(state.refreshPayments).toHaveBeenCalledWith('event', 'entry')
    );
    expect(
      screen.queryByRole('button', { name: prefix + 'UnmarkPaid' })
    ).not.toBeInTheDocument();
  });
  it('lets the user explicitly record legacy confirmed cash without clearing its paid flag', async () => {
    state.entry.paid = true;
    render(<EventEntriesManagePage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: prefix + 'RecordConfirmedCash',
      })
    );
    await waitFor(() =>
      expect(state.paidUpdate).toHaveBeenCalledWith({
        variables: { entryId: 'entry', paid: true, deviceId: 'browser-device' },
      })
    );
  });
  it('does not offer an invalid unpaid toggle for receipt-backed cash', () => {
    state.entry.paid = true;
    state.entry.paymentCount = 1;
    render(<EventEntriesManagePage />);
    expect(
      screen.queryByRole('button', { name: prefix + 'UnmarkPaid' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: prefix + 'RecordConfirmedCash' })
    ).not.toBeInTheDocument();
  });
});
