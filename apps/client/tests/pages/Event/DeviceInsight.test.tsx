import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode, AnchorHTMLAttributes } from 'react';
import en from '@/i18n/locales/en/translation.json';
const state = vi.hoisted(() => ({
  failed: false,
  nativeAvailable: true,
  sessionState: 'stopped',
  sessionUntil: null as string | null,
  settings: null as null | {
    hours: number;
    checkCode: number;
    startCode: number;
    finishCode: number;
    brokerProfile: string;
    meshtasticChannel: string | null;
  },
  devices: [] as Record<string, unknown>[],
  calls: [] as Record<string, unknown>[],
  mutation: vi.fn().mockResolvedValue({
    data: { registerLiveDevice: { token: 'device-secret' } },
  }),
}));
vi.mock('@apollo/client/react', () => ({
  useQuery: (
    _query: unknown,
    options: { variables: Record<string, unknown>; skip?: boolean }
  ) => {
    state.calls.push(options.variables);
    return {
      data: options.skip
        ? undefined
        : {
            eventLiveStatus: {
              devices: state.devices,
              yarocSettings: state.settings,
              monitoringUntil: null,
              brokerProfiles: ['default'],
              yarocAvailable: state.nativeAvailable,
              sessionUntil: state.sessionUntil,
              sessionState: state.sessionState,
              sessionError: null,
            },
            eventDeviceHistory: { samples: [], outages: [] },
          },
      error: state.failed ? new Error('offline') : undefined,
      loading: false,
      refetch: vi.fn().mockImplementation(async () => ({
        data: {
          eventLiveStatus: {
            devices: state.devices,
            yarocSettings: state.settings,
            monitoringUntil: null,
            brokerProfiles: ['default'],
            yarocAvailable: state.nativeAvailable,
            sessionState: state.sessionState,
            sessionUntil: state.sessionUntil,
            sessionError: null,
          },
        },
      })),
    };
  },
  useMutation: () => [state.mutation],
  useSubscription: () => ({}),
}));
vi.mock('@/hooks/useEvent', () => ({
  useEvent: () => ({ event: { name: 'Test Race', timezone: 'Europe/Prague' } }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split('.')
        .reduce((v: unknown, k) => (v as Record<string, unknown>)?.[k], en) ??
      key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ eventId: 'race' }),
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    params?: Record<string, string>;
    search?: unknown;
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? '')}
      {...props}
      data-search={search ? JSON.stringify(search) : undefined}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/templates/MainPageLayout', () => ({
  MainPageLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Line: () => null,
    LineChart: Container,
    Bar: () => null,
    BarChart: Container,
    CartesianGrid: () => null,
    ResponsiveContainer: Container,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});
import {
  EventDeviceInsightPage,
  EventDeviceSettingsPanel,
} from '@/pages/Event/Insights/EventDeviceInsightPage';
describe('device insight', () => {
  beforeEach(() => {
    state.devices = [];
    state.failed = false;
    state.nativeAvailable = true;
    state.sessionState = 'stopped';
    state.sessionUntil = null;
    state.settings = null;
    state.calls = [];
    state.mutation.mockClear();
  });
  it('distinguishes an empty registry from unavailable data', () => {
    const view = render(<EventDeviceInsightPage />);
    expect(screen.getByText('No devices registered')).toBeInTheDocument();
    state.failed = true;
    view.rerender(<EventDeviceInsightPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('stale');
  });
  it('shows zero battery and opens history scoped to the selected device', () => {
    state.devices = [
      {
        id: 'radio',
        name: 'Radio 1',
        sourceType: 'yaroc',
        status: 'online',
        batteryPercent: 0,
        intervalSeconds: 60,
        lastSeenAt: null,
      },
    ];
    render(<EventDeviceInsightPage />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Radio 1' }));
    expect(
      screen.getByText('No measurements in this interval')
    ).toBeInTheDocument();
    expect(
      state.calls.some(c => c.eventId === 'race' && c.deviceId === 'radio')
    ).toBe(true);
  });
  it('keeps configuration out of Insights', () => {
    render(<EventDeviceInsightPage />);
    expect(
      screen.queryByRole('button', { name: 'Register device' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start YAROC reception' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Manage devices')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Insights' }).querySelector('svg')
    ).not.toBeNull();
  });
  it('shows MeOS import state, received bytes and processing duration', () => {
    state.devices = [
      {
        id: 'meos',
        name: 'MeOS MOP 42',
        sourceType: 'meos',
        status: 'online',
        intervalSeconds: 60,
        lastSeenAt: null,
        uploadState: 'completed',
        uploadBytes: 1024,
        uploadDurationMs: 1500,
      },
    ];
    render(<EventDeviceInsightPage />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/1,024 B/)).toHaveTextContent('1.5 s');
  });
  it('loads and saves YAROC configuration in settings without starting reception', async () => {
    state.settings = {
      hours: 24,
      checkCode: 81,
      startCode: 82,
      finishCode: 83,
      brokerProfile: 'default',
      meshtasticChannel: 'LongFast',
    };
    render(<EventDeviceSettingsPanel eventId="race" />);
    expect(screen.getByLabelText('Check unit code')).toHaveValue(81);
    expect(
      screen.queryByText(/register automatically using the event password/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText('uploader')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save YAROC configuration' })
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Check unit code'), {
      target: { value: 84 },
    });
    expect(
      screen.queryByRole('option', { name: 'quickevent' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save YAROC configuration' })
    );
    await vi.waitFor(() => expect(state.mutation).toHaveBeenCalledOnce());
    expect(state.mutation).toHaveBeenCalledWith({
      variables: { eventId: 'race', ...state.settings, checkCode: 84 },
    });
  });
  it('enables Start only with a valid fleet, configuration and native receiver', () => {
    state.settings = {
      hours: 24,
      checkCode: 3,
      startCode: 1,
      finishCode: 2,
      brokerProfile: 'default',
      meshtasticChannel: null,
    };
    const view = render(<EventDeviceSettingsPanel eventId="race" />);
    expect(
      screen.getByRole('button', { name: 'Start YAROC reception' })
    ).toBeDisabled();
    state.devices = [
      {
        id: 'radio',
        name: 'Radio 1',
        sourceType: 'yaroc',
        macAddress: 'deadbeef1234',
        intervalSeconds: 60,
        revoked: false,
        status: 'waiting',
        lastSeenAt: null,
      },
    ];
    view.rerender(<EventDeviceSettingsPanel eventId="race" />);
    expect(
      screen.getByRole('button', { name: 'Start YAROC reception' })
    ).toBeEnabled();
    state.nativeAvailable = false;
    view.rerender(<EventDeviceSettingsPanel eventId="race" />);
    expect(
      screen.getByRole('button', { name: 'Start YAROC reception' })
    ).toBeDisabled();
    expect(
      screen.getByText(
        'YAROC is unavailable on the server. Reception cannot be started.'
      )
    ).toBeInTheDocument();
  });
  it('starts valid unchanged configuration once without a redundant save', async () => {
    state.settings = {
      hours: 24,
      checkCode: 3,
      startCode: 1,
      finishCode: 2,
      brokerProfile: 'default',
      meshtasticChannel: null,
    };
    state.devices = [
      {
        id: 'radio',
        name: 'Radio 1',
        sourceType: 'yaroc',
        macAddress: 'deadbeef1234',
        intervalSeconds: 60,
        revoked: false,
        status: 'waiting',
        lastSeenAt: null,
      },
    ];
    render(<EventDeviceSettingsPanel eventId="race" />);
    expect(
      screen.getByRole('button', { name: 'Save YAROC configuration' })
    ).toBeDisabled();
    const start = screen.getByRole('button', { name: 'Start YAROC reception' });
    fireEvent.click(start);
    fireEvent.click(start);
    await vi.waitFor(() => expect(state.mutation).toHaveBeenCalledOnce());
    expect(state.mutation).toHaveBeenCalledWith({
      variables: { eventId: 'race', ...state.settings },
    });
  });
  it('validates edits and allows stopping active reception despite invalid edits', async () => {
    state.settings = {
      hours: 24,
      checkCode: 3,
      startCode: 1,
      finishCode: 2,
      brokerProfile: 'default',
      meshtasticChannel: null,
    };
    const view = render(<EventDeviceSettingsPanel eventId="race" />);
    fireEvent.change(screen.getByLabelText('Check unit code'), {
      target: { value: 1 },
    });
    expect(
      screen.getByRole('button', { name: 'Save YAROC configuration' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Stop reception' })
    ).toBeDisabled();
    state.sessionState = 'running';
    state.sessionUntil = new Date(Date.now() + 3600_000).toISOString();
    view.rerender(<EventDeviceSettingsPanel eventId="race" />);
    const stop = screen.getByRole('button', { name: 'Stop reception' });
    expect(stop).toBeEnabled();
    fireEvent.click(stop);
    fireEvent.click(stop);
    await vi.waitFor(() => expect(state.mutation).toHaveBeenCalledOnce());
    expect(state.mutation).toHaveBeenCalledWith({
      variables: { eventId: 'race' },
    });
  });
  it('registers a device and displays its token only after explicit management', async () => {
    render(<EventDeviceSettingsPanel eventId="race" />);
    expect(screen.queryByText('device-secret')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Radio 1' },
    });
    fireEvent.change(screen.getByLabelText('MAC'), {
      target: { value: 'deadbeef1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register device' }));
    expect(await screen.findByText('device-secret')).toBeInTheDocument();
    expect(state.mutation).toHaveBeenCalledWith({
      variables: {
        eventId: 'race',
        name: 'Radio 1',
        sourceType: 'yaroc',
        macAddress: 'deadbeef1234',
        intervalSeconds: 60,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss token' }));
    expect(screen.queryByText('device-secret')).not.toBeInTheDocument();
  });
});
