import { MockedProvider } from '@apollo/client/testing/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EVENT_ANOMALY_INSIGHT,
  useAnomalyInsight,
} from '@/pages/Event/Insights/useAnomalyInsight';

const report = { competitors: [], coverage: [] };
const request = {
  query: EVENT_ANOMALY_INSIGHT,
  variables: { eventId: 'race' },
};

describe('anomaly insight Apollo lifecycle', () => {
  it('retains the previous report across repeated refresh errors and recovers', async () => {
    const { result } = renderHook(() => useAnomalyInsight('race'), {
      wrapper: ({ children }) => (
        <MockedProvider
          mocks={[
            { request, result: { data: { eventAnomalyInsight: report } } },
            { request, error: new Error('offline') },
            { request, error: new Error('still offline') },
            { request, result: { data: { eventAnomalyInsight: report } } },
          ]}
        >
          {children}
        </MockedProvider>
      ),
    });
    await waitFor(() =>
      expect(result.current.data?.eventAnomalyInsight).toEqual(report)
    );
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await result.current.refetch().catch(() => {});
      });
      await waitFor(() => expect(result.current.error).toBeDefined());
      expect(
        result.current.data?.eventAnomalyInsight ??
          result.current.previousData?.eventAnomalyInsight
      ).toEqual(report);
    }
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(result.current.data?.eventAnomalyInsight).toEqual(report);
  });
});
