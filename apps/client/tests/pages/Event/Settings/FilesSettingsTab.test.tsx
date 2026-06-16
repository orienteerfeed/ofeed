import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Stub the heavy upload organism: render a button that triggers the success
// callback so the Files tab's refetch path can be exercised in isolation.
vi.mock('@/components/organisms', () => ({
  DragDropFile: ({
    onUploadSuccess,
  }: {
    onUploadSuccess?: (response: unknown) => void;
  }) => (
    <button type="button" onClick={() => onUploadSuccess?.({})}>
      upload
    </button>
  ),
}));

vi.mock('@/utils', () => ({
  toast: vi.fn(),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/lib/date', () => ({
  formatDateTimeSeconds: (value: string) => value,
  getLocaleKey: () => 'enGB',
}));

import {
  FilesSettingsTab,
  GET_EVENT_FILES_STATUS,
  GET_EVENT_IMPORT_STATES,
} from '@/pages/Event/Settings/FilesSettingsTab';

const t = ((key: string) => key) as never;

const statusResult = (overrides?: {
  startListAvailable?: boolean;
  coursesAvailable?: boolean;
  radioControls?: Array<{
    id: number;
    code: string;
    type: string;
    radio: boolean;
  }>;
}) => ({
  eventFilesStatus: {
    __typename: 'EventFilesStatus',
    startList: {
      __typename: 'EventFilesStartListStatus',
      available: overrides?.startListAvailable ?? false,
      classesCount: 1,
      competitorsCount: 0,
      competitorsWithStartTimeCount: 0,
      source: overrides?.startListAvailable ? 'data' : null,
    },
    courses: {
      __typename: 'EventFilesCoursesStatus',
      available: overrides?.coursesAvailable ?? true,
      coursesCount: 1,
      controlsCount: 3,
      courseControlsCount: 5,
      source: overrides?.coursesAvailable === false ? null : 'data',
    },
    results: {
      __typename: 'EventFilesResultsStatus',
      available: false,
      competitorsCount: 0,
      competitorsWithResultDataCount: 0,
      source: null,
    },
    radioControls: (
      overrides?.radioControls ?? [
        { id: 101, code: '100', type: 'CONTROL', radio: false },
        { id: 102, code: '101', type: 'CONTROL', radio: true },
      ]
    ).map(c => ({ __typename: 'EventFilesRadioControl', ...c })),
  },
});

const statusMock = (overrides?: Parameters<typeof statusResult>[0]) => ({
  request: { query: GET_EVENT_FILES_STATUS, variables: { eventId: 'event-1' } },
  result: { data: statusResult(overrides) },
});

const importStatesMock = (
  states: Array<{
    sourceType: string;
    payloadType: string;
    rawHash: string;
    creator?: string | null;
    externalStatus?: string | null;
    lastSuccessfulImportAt?: string | null;
    successCount: number;
    skippedCount: number;
  }> = []
) => ({
  request: {
    query: GET_EVENT_IMPORT_STATES,
    variables: { eventId: 'event-1' },
  },
  result: {
    data: {
      eventImportStates: states.map(s => ({
        __typename: 'EventImportState',
        creator: null,
        externalStatus: null,
        lastSuccessfulImportAt: null,
        ...s,
      })),
    },
  },
});

describe('FilesSettingsTab', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });
  it('renders all three sections; courses upload is locked until startlist or results exist', async () => {
    render(
      <MockedProvider mocks={[statusMock(), importStatesMock()]}>
        <FilesSettingsTab t={t} eventId="event-1" />
      </MockedProvider>
    );

    expect(
      await screen.findByText('Pages.Event.Settings.Files.StartList')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pages.Event.Settings.Files.Courses')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pages.Event.Settings.Files.CoursesHelper')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pages.Event.Settings.Files.Results')
    ).toBeInTheDocument();
    // Courses upload is locked (no startlist/results yet) → only start list + results buttons.
    expect(screen.getAllByRole('button', { name: 'upload' })).toHaveLength(2);
    expect(
      screen.getByText('Pages.Event.Settings.Files.CoursesDisabledHint')
    ).toBeInTheDocument();
  });

  it('shows courses upload once the start list is available', async () => {
    render(
      <MockedProvider
        mocks={[statusMock({ startListAvailable: true }), importStatesMock()]}
      >
        <FilesSettingsTab t={t} eventId="event-1" />
      </MockedProvider>
    );

    await screen.findByText('Pages.Event.Settings.Files.StartList');
    // All three sections have an upload button.
    expect(screen.getAllByRole('button', { name: 'upload' })).toHaveLength(3);
  });

  it('keeps the online split controls section hidden for future development', async () => {
    render(
      <MockedProvider mocks={[statusMock(), importStatesMock()]}>
        <FilesSettingsTab t={t} eventId="event-1" />
      </MockedProvider>
    );

    await screen.findByText('Pages.Event.Settings.Files.StartList');
    expect(
      screen.queryByText('Pages.Event.Settings.Files.RadioControls.Title')
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('100')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('101')).not.toBeInTheDocument();
  });

  it('refetches status after a successful upload', async () => {
    render(
      <MockedProvider
        mocks={[
          statusMock(),
          importStatesMock(),
          statusMock({ startListAvailable: true }),
        ]}
      >
        <FilesSettingsTab t={t} eventId="event-1" />
      </MockedProvider>
    );

    // Initially the start list and results are unavailable (courses available).
    await screen.findByText('Pages.Event.Settings.Files.StartList');
    expect(
      screen.getAllByText('Pages.Event.Settings.Files.Missing')
    ).toHaveLength(2);

    // Triggering an upload success refetches; the second mock reports the start
    // list as available, so only the results section stays "Missing".
    const [firstUpload] = screen.getAllByRole('button', { name: 'upload' });
    fireEvent.click(firstUpload!);

    await waitFor(() =>
      expect(
        screen.getAllByText('Pages.Event.Settings.Files.Missing')
      ).toHaveLength(1)
    );
  });

  it('displays import state metadata for a section that has an IOF_XML state', async () => {
    const states = [
      {
        sourceType: 'IOF_XML',
        payloadType: 'StartList',
        rawHash:
          'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        creator: 'organizer@example.com',
        externalStatus: 'OK',
        lastSuccessfulImportAt: '2026-06-11T10:00:00.000Z',
        successCount: 42,
        skippedCount: 3,
      },
    ];

    render(
      <MockedProvider mocks={[statusMock(), importStatesMock(states)]}>
        <FilesSettingsTab t={t} eventId="event-1" />
      </MockedProvider>
    );

    await screen.findByText('Pages.Event.Settings.Files.StartList');

    // Wait for the import states query to resolve and the hash button to appear.
    const hashBtn = await screen.findByTitle(
      'Pages.Event.Settings.Files.ImportState.CopyHash'
    );
    expect(hashBtn).toBeInTheDocument();
    expect(hashBtn).toHaveTextContent('abcdef12…');

    // The metadata row contains creator and success count.
    const metaRow = hashBtn.parentElement!;
    expect(metaRow).toHaveTextContent('organizer@example.com');
    expect(metaRow).toHaveTextContent('42');
  });

  it('hides import state metadata when no state exists for a section', async () => {
    render(
      <MockedProvider mocks={[statusMock(), importStatesMock()]}>
        <FilesSettingsTab t={t} eventId="event-1" />
      </MockedProvider>
    );

    await screen.findByText('Pages.Event.Settings.Files.StartList');

    expect(
      screen.queryByTitle('Pages.Event.Settings.Files.ImportState.CopyHash')
    ).not.toBeInTheDocument();
  });
});
