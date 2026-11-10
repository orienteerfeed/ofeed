import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  payments: [] as { id: string }[],
  paidUpdate: vi.fn(),
  otherUpdate: vi.fn(),
  refetch: vi.fn(),
  refetchPayments: vi.fn(),
  entry: {
    id: 'entry',
    eventId: 'event',
    status: 'RECEIVED',
    paid: false,
    paymentMethod: 'CASH',
    paymentReference: '2600000001',
    contactEmail: 'cash@test.invalid',
    contactFirstname: 'Test',
    contactLastname: 'Cash',
    totalAmount: 250,
    currency: 'CZK',
    createdAt: '2026-11-01T08:00:00Z',
    updatedAt: '2026-11-01T08:00:00Z',
    items: [],
    addOnItems: [],
    statusHistory: [],
    qrPayment: null,
    event: {
      id: 'event',
      name: 'Race',
      date: '2026-11-01T09:00:00Z',
      organizer: null,
      vatPayer: false,
      vatRate: null,
    },
  },
}));
vi.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { entryOrderById: state.entry },
    loading: false,
    refetch: state.refetch,
  }),
  useMutation: (doc: { loc?: { source: { body: string } } }) => [
    doc.loc?.source.body.includes('mutation EntryOrderPaidUpdate')
      ? state.paidUpdate
      : state.otherUpdate,
  ],
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ eventId: 'event', entryId: 'entry' }),
  useSearch: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/templates/MainPageLayout', () => ({
  MainPageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/pages/Event/Entries/entries.hooks', () => ({
  useRefreshEntryPaymentQueries: () => state.refetchPayments,
  useEntryPayments: () => ({
    data: state.payments,
    refetch: state.refetchPayments,
  }),
}));
vi.mock('@/pages/Event/Entries/EntryPaymentLedger', () => ({
  EntryPaymentLedger: () => null,
}));
vi.mock('@/pages/Event/Entries/EntryItemsTable', () => ({
  EntryItemsTable: () => null,
}));
vi.mock('@/components/molecules/EntryPaymentDeadline', () => ({
  EntryPaymentDeadline: () => null,
}));
vi.mock('qrcode.react', () => ({ QRCodeCanvas: () => <canvas /> }));
vi.mock('@/utils', () => ({ toast: vi.fn() }));
vi.mock('@/stores/auth/session-manager', () => ({
  getDeviceMetadata: () => ({ deviceId: 'browser-device' }),
}));
import { EventEntryOrderDetailPage } from '@/pages/Event/Entries/EventEntryOrderDetailPage';
const action = 'Pages.Event.EntriesManage.Actions.MarkCashPaid';
beforeEach(() => {
  vi.clearAllMocks();
  state.entry.paid = false;
  state.payments = [];
  window.localStorage.clear();
  state.paidUpdate.mockImplementation(async () => {
    state.entry.paid = true;
    return {};
  });
  state.refetch.mockResolvedValue({});
  state.refetchPayments.mockImplementation(async () => {
    state.payments = [{ id: 'receipt' }];
    return {};
  });
});
describe('cash paid action', () => {
  it('clearly records cash, supplies the configured device and refreshes receipts', async () => {
    window.localStorage.setItem(
      'orienteerfeed:entry-payments:device-id',
      'desk-1'
    );
    render(<EventEntryOrderDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() =>
      expect(state.paidUpdate).toHaveBeenCalledWith({
        variables: { entryId: 'entry', paid: true, deviceId: 'desk-1' },
      })
    );
    await waitFor(() => expect(state.refetchPayments).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: 'Pages.Event.EntriesManage.Actions.UnmarkPaid',
        })
      ).not.toBeInTheDocument()
    );
  });
  it('uses the stable browser device when no cash desk is configured', async () => {
    render(<EventEntryOrderDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() =>
      expect(state.paidUpdate).toHaveBeenCalledWith({
        variables: { entryId: 'entry', paid: true, deviceId: 'browser-device' },
      })
    );
  });
});
