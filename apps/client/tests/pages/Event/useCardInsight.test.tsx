import { MockedProvider } from '@apollo/client/testing/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EVENT_CARD_INSIGHT,
  useCardInsight,
} from '@/pages/Event/Insights/useCardInsight';

const report = { missingCards: [], duplicateCards: [] };
const request = { query: EVENT_CARD_INSIGHT, variables: { eventId: 'race' } };

describe('card insight Apollo lifecycle', () => {
  it('retains the previous report across repeated refresh errors and recovers', async () => {
    const { result } = renderHook(() => useCardInsight('race'), {
      wrapper: ({ children }) => (
        <MockedProvider
          mocks={[
            { request, result: { data: { eventCardInsight: report } } },
            { request, error: new Error('offline') },
            { request, error: new Error('still offline') },
            { request, result: { data: { eventCardInsight: report } } },
          ]}
        >
          {children}
        </MockedProvider>
      ),
    });
    await waitFor(() =>
      expect(result.current.data?.eventCardInsight).toEqual(report)
    );
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await result.current.refetch().catch(() => {});
      });
      await waitFor(() => expect(result.current.error).toBeDefined());
      expect(
        result.current.data?.eventCardInsight ??
          result.current.previousData?.eventCardInsight
      ).toEqual(report);
    }
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(result.current.data?.eventCardInsight).toEqual(report);
  });
});
