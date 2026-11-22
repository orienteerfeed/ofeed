import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleteFollow } from '@repo/shared';
import en from '@/i18n/locales/en/translation.json';
import { AthleteFollows } from '@/pages/Profile/AthleteFollows';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options: Record<string, unknown> = {}) => {
      const dictionary: Record<string, string> = key.startsWith(
        'AthleteFollows.'
      )
        ? en.AthleteFollows
        : en.Notifications;
      let value = dictionary[key.split('.')[1]!] ?? key;
      for (const [name, text] of Object.entries(options))
        value = value.replaceAll(`{{${name}}}`, String(text));
      return value;
    },
  }),
}));
let rows: AthleteFollow[];
let queryFails: boolean;
let mutationFails: boolean;
beforeEach(() => {
  rows = [
    {
      id: 'follow-1',
      registration: 'ABC9001',
      source: 'ORIS',
      displayName: 'Runner Test',
      pausedAt: null,
      createdAt: '2026-11-13T09:00:00Z',
    },
  ];
  queryFails = false;
  mutationFails = false;
});
function mount() {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      operation =>
        new Observable(observer => {
          if (operation.operationName === 'AthleteFollowsChanged')
            return () => {};
          if (operation.operationName === 'MyAthleteFollows') {
            if (queryFails) {
              observer.error(new Error('offline'));
              return undefined;
            }
            observer.next({
              data: { myAthleteFollows: rows.map(row => ({ ...row })) },
            });
          } else {
            if (mutationFails) {
              observer.error(new Error('offline'));
              return undefined;
            }
            if (operation.operationName === 'SetAthleteFollowPaused') {
              rows = rows.map(row =>
                row.id === operation.variables.id
                  ? {
                      ...row,
                      pausedAt: operation.variables.paused
                        ? new Date().toISOString()
                        : null,
                    }
                  : row
              );
              observer.next({ data: { setAthleteFollowPaused: true } });
            } else {
              rows = rows.filter(row => row.id !== operation.variables.id);
              observer.next({ data: { removeAthleteFollow: true } });
            }
          }
          observer.complete();
          return undefined;
        })
    ),
  });
  return render(
    <ApolloProvider client={client}>
      <AthleteFollows />
    </ApolloProvider>
  );
}
describe('profile following management', () => {
  it('shows the persisted registration, issuer, name and active state', async () => {
    mount();
    expect(await screen.findByText('ABC9001')).toBeInTheDocument();
    expect(screen.getByText('Runner Test')).toBeInTheDocument();
    expect(screen.getByText(/ORIS/)).toBeInTheDocument();
    expect(screen.getByText('Active', { exact: true })).toBeInTheDocument();
  });
  it('pauses and resumes while keeping the saved competitor', async () => {
    mount();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Pause following: Runner Test',
      })
    );
    expect(
      await screen.findByText('Paused', { exact: true })
    ).toBeInTheDocument();
    expect(rows).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Resume following: Runner Test' })
    );
    expect(
      await screen.findByText('Active', { exact: true })
    ).toBeInTheDocument();
    expect(rows[0]?.pausedAt).toBeNull();
  });
  it('requires confirmation to cancel and can keep the selection', async () => {
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Stop following: Runner Test' })
    );
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Keep following',
      })
    );
    expect(rows).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop following: Runner Test' })
    );
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Stop following',
      })
    );
    expect(
      await screen.findByText(/No registration follows yet/)
    ).toBeInTheDocument();
    expect(rows).toHaveLength(0);
  });
  it('reports failed updates without losing the saved record', async () => {
    mutationFails = true;
    mount();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Pause following: Runner Test',
      })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save'
    );
    expect(rows[0]?.pausedAt).toBeNull();
    expect(screen.getByText('Active', { exact: true })).toBeInTheDocument();
  });
  it('recovers from a load error through retry', async () => {
    queryFails = true;
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load'
    );
    queryFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByText('ABC9001')).toBeInTheDocument()
    );
  });
  it('shows the empty state', async () => {
    rows = [];
    mount();
    expect(
      await screen.findByText(/No registration follows yet/)
    ).toBeInTheDocument();
  });
});
