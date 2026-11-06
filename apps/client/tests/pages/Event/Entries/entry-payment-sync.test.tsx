import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntryPaymentInsight } from '@repo/shared';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/hooks/useApi', () => ({ useApi: () => api }));
import { usePaymentInsights } from '@/pages/Event/Insights/usePaymentInsights';
import {
  useRecordEntryPayment,
  useRefreshEntryPaymentQueries,
} from '@/pages/Event/Entries/entries.hooks';
let receipts: EntryPaymentInsight[] = [];
const receipt = (method: 'QR' | 'CASH'): EntryPaymentInsight => ({
  id: `receipt-${method}`,
  eventId: 'event',
  entryId: 'entry',
  clientPaymentId: '11111111-1111-4111-8111-111111111111',
  method,
  amount: method === 'QR' ? 120 : 250,
  currency: 'CZK',
  paidAt: '2026-11-04T09:00:00Z',
  recordedAt: '2026-11-04T09:00:00Z',
  deviceId: 'desk-1',
  operatorId: 7,
  source: 'MANUAL',
  bankTransactionId: null,
  bookingDate: null,
  paymentReference: '2600000001',
  contactFirstname: 'Test',
  contactLastname: 'Cash',
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  receipts = [receipt('QR')];
  vi.clearAllMocks();
  focusManager.setFocused(true);
  api.get.mockImplementation(async () => ({ data: [...receipts] }));
  api.post.mockImplementation(async () => {
    const value = receipt('CASH');
    receipts.push(value);
    return { data: value };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});
describe('shared cash/QR payment report synchronization', () => {
  it('refreshes the report after a GraphQL cash settlement from the entry list', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        report: usePaymentInsights('event'),
        refresh: useRefreshEntryPaymentQueries(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.report.data).toHaveLength(1));
    receipts.push(receipt('CASH'));
    await act(async () => {
      await result.current.refresh('event', 'entry');
    });
    await waitFor(() =>
      expect(result.current.report.data?.map(row => row.method)).toEqual([
        'QR',
        'CASH',
      ])
    );
  });
  it('refreshes the report when a POS-compatible REST receipt is recorded', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        report: usePaymentInsights('event'),
        record: useRecordEntryPayment(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.report.data).toHaveLength(1));
    await act(async () => {
      await result.current.record.mutateAsync({
        eventId: 'event',
        entryId: 'entry',
        payment: {
          clientPaymentId: '11111111-1111-4111-8111-111111111111',
          method: 'CASH',
          amount: 250,
          currency: 'CZK',
          paidAt: '2026-11-04T09:00:00Z',
          deviceId: 'desk-1',
        },
      });
    });
    await waitFor(() =>
      expect(
        result.current.report.data?.reduce((sum, row) => sum + row.amount, 0)
      ).toBe(370)
    );
  });
  it('picks up external POS writes while visible and pauses polling in the background', async () => {
    vi.useFakeTimers();
    const { wrapper } = setup();
    const { result } = renderHook(() => usePaymentInsights('event'), {
      wrapper,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });
    expect(result.current.data).toHaveLength(1);
    focusManager.setFocused(false);
    receipts.push(receipt('CASH'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_005);
    });
    expect(result.current.data).toHaveLength(1);
    await act(async () => {
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(5);
    });
    expect(result.current.data).toHaveLength(2);
    receipts.push({ ...receipt('CASH'), id: 'second-pos-receipt' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_005);
    });
    expect(result.current.data).toHaveLength(3);
  });
});
