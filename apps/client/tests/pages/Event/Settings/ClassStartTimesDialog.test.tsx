import { MockedProvider } from '@apollo/client/testing/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils', () => ({ toast: vi.fn() }));

import {
  CLASS_COMPETITOR_START_TIMES,
  CLASS_START_SLOT_VACANCIES,
  CREATE_START_SLOT_VACANCY,
  ClassStartTimesDialog,
} from '@/pages/Event/Settings/ClassStartTimesDialog';

const t = ((key: string) => key) as never;

function competitorStartTimesMock(classId = 1, startTimes: string[] = []) {
  return {
    request: {
      query: CLASS_COMPETITOR_START_TIMES,
      variables: { classId },
    },
    result: {
      data: {
        classCompetitorStartTimes: startTimes.map((startTime, index) => ({
          id: index + 1,
          startTime,
          __typename: 'ClassCompetitorStartTime',
        })),
      },
    },
  };
}

describe('ClassStartTimesDialog', () => {
  it('formats vacancy times in the event timezone', async () => {
    const vacanciesMock = {
      request: {
        query: CLASS_START_SLOT_VACANCIES,
        variables: { classId: 1 },
      },
      result: {
        data: {
          classStartSlotVacancies: [
            {
              id: 10,
              startTime: '2026-06-15T08:00:00.000Z',
              bibNumber: 42,
              __typename: 'ClassStartSlotVacancy',
            },
          ],
        },
      },
    };
    render(
      <MockedProvider mocks={[vacanciesMock, competitorStartTimesMock()]}>
        <ClassStartTimesDialog
          t={t}
          classId={1}
          className="H21"
          timezone="Europe/Prague"
          open
          onOpenChange={() => undefined}
        />
      </MockedProvider>
    );

    expect(await screen.findByText('15.06.2026 10:00')).toBeInTheDocument();
  });

  it('adds the next vacancy using the detected interval in the event timezone', async () => {
    const initialVacanciesMock = {
      request: {
        query: CLASS_START_SLOT_VACANCIES,
        variables: { classId: 1 },
      },
      result: {
        data: {
          classStartSlotVacancies: [
            {
              id: 10,
              startTime: '2026-06-15T08:00:00.000Z',
              bibNumber: 42,
              __typename: 'ClassStartSlotVacancy',
            },
            {
              id: 11,
              startTime: '2026-06-15T08:02:00.000Z',
              bibNumber: 43,
              __typename: 'ClassStartSlotVacancy',
            },
          ],
        },
      },
    };
    const createVacancyMock = {
      request: {
        query: CREATE_START_SLOT_VACANCY,
        variables: {
          input: {
            classId: 1,
            startTime: '2026-06-15T08:04:00.000Z',
            bibNumber: 44,
          },
        },
      },
      result: {
        data: {
          createStartSlotVacancy: {
            id: 12,
            startTime: '2026-06-15T08:04:00.000Z',
            bibNumber: 44,
            __typename: 'ClassStartSlotVacancy',
          },
        },
      },
    };
    const refreshedVacanciesMock = {
      request: {
        query: CLASS_START_SLOT_VACANCIES,
        variables: { classId: 1 },
      },
      result: {
        data: {
          classStartSlotVacancies: [
            {
              id: 10,
              startTime: '2026-06-15T08:00:00.000Z',
              bibNumber: 42,
              __typename: 'ClassStartSlotVacancy',
            },
            {
              id: 11,
              startTime: '2026-06-15T08:02:00.000Z',
              bibNumber: 43,
              __typename: 'ClassStartSlotVacancy',
            },
            {
              id: 12,
              startTime: '2026-06-15T08:04:00.000Z',
              bibNumber: 44,
              __typename: 'ClassStartSlotVacancy',
            },
          ],
        },
      },
    };
    render(
      <MockedProvider
        mocks={[
          initialVacanciesMock,
          competitorStartTimesMock(),
          createVacancyMock,
          refreshedVacanciesMock,
        ]}
      >
        <ClassStartTimesDialog
          t={t}
          classId={1}
          className="H21"
          timezone="Europe/Prague"
          open
          onOpenChange={() => undefined}
        />
      </MockedProvider>
    );

    await screen.findByText('15.06.2026 10:02');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Pages.Event.Settings.Classes.StartTimes.Form.UseNext',
      })
    );
    expect(
      screen.getByLabelText('Pages.Event.Settings.Classes.StartTimes.Form.Date')
    ).toHaveValue('2026-06-15');
    expect(
      screen.getByLabelText('Pages.Event.Settings.Classes.StartTimes.Form.Time')
    ).toHaveValue('10:04');

    fireEvent.change(
      screen.getByLabelText('Pages.Event.Settings.Classes.StartTimes.Bib'),
      { target: { value: '44' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Pages.Event.Settings.Classes.StartTimes.Form.Add',
      })
    );

    expect(await screen.findByText('15.06.2026 10:04')).toBeInTheDocument();
  });

  it('does not infer an interval from other classes when the selected class has too few vacancies', async () => {
    const selectedClassVacanciesMock = {
      request: {
        query: CLASS_START_SLOT_VACANCIES,
        variables: { classId: 1 },
      },
      result: {
        data: {
          classStartSlotVacancies: [
            {
              id: 10,
              startTime: '2026-06-15T08:10:00.000Z',
              bibNumber: 50,
              __typename: 'ClassStartSlotVacancy',
            },
          ],
        },
      },
    };
    render(
      <MockedProvider
        mocks={[selectedClassVacanciesMock, competitorStartTimesMock()]}
      >
        <ClassStartTimesDialog
          t={t}
          classId={1}
          className="D12C"
          timezone="Europe/Prague"
          open
          onOpenChange={() => undefined}
        />
      </MockedProvider>
    );

    await screen.findByText('15.06.2026 10:10');
    expect(
      await screen.findByText(
        'Pages.Event.Settings.Classes.StartTimes.Form.ManualHint'
      )
    ).toBeInTheDocument();
  });

  it('falls back to competitor start times from the selected class when vacancies are insufficient', async () => {
    const selectedClassVacanciesMock = {
      request: {
        query: CLASS_START_SLOT_VACANCIES,
        variables: { classId: 1 },
      },
      result: {
        data: {
          classStartSlotVacancies: [
            {
              id: 10,
              startTime: '2026-06-15T08:10:00.000Z',
              bibNumber: 50,
              __typename: 'ClassStartSlotVacancy',
            },
          ],
        },
      },
    };

    render(
      <MockedProvider
        mocks={[
          selectedClassVacanciesMock,
          competitorStartTimesMock(1, [
            '2026-06-15T08:00:00.000Z',
            '2026-06-15T08:02:00.000Z',
            '2026-06-15T08:04:00.000Z',
          ]),
        ]}
      >
        <ClassStartTimesDialog
          t={t}
          classId={1}
          className="D12C"
          timezone="Europe/Prague"
          open
          onOpenChange={() => undefined}
        />
      </MockedProvider>
    );

    await screen.findByText('15.06.2026 10:10');
    expect(
      await screen.findByText(
        'Pages.Event.Settings.Classes.StartTimes.Form.IntervalHint'
      )
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Pages.Event.Settings.Classes.StartTimes.Form.UseNext',
      })
    );
    expect(
      screen.getByLabelText('Pages.Event.Settings.Classes.StartTimes.Form.Time')
    ).toHaveValue('10:12');
  });

  it('clears unsaved form values when opened for another class', async () => {
    const firstClassVacanciesMock = {
      request: {
        query: CLASS_START_SLOT_VACANCIES,
        variables: { classId: 1 },
      },
      result: {
        data: {
          classStartSlotVacancies: [],
        },
      },
    };
    const secondClassVacanciesMock = {
      request: {
        query: CLASS_START_SLOT_VACANCIES,
        variables: { classId: 2 },
      },
      result: {
        data: {
          classStartSlotVacancies: [],
        },
      },
    };

    const { rerender } = render(
      <MockedProvider
        mocks={[
          firstClassVacanciesMock,
          competitorStartTimesMock(1),
          secondClassVacanciesMock,
          competitorStartTimesMock(2),
        ]}
      >
        <ClassStartTimesDialog
          t={t}
          classId={1}
          className="H21"
          timezone="Europe/Prague"
          open
          onOpenChange={() => undefined}
        />
      </MockedProvider>
    );

    const dateInput = screen.getByLabelText(
      'Pages.Event.Settings.Classes.StartTimes.Form.Date'
    );
    const timeInput = screen.getByLabelText(
      'Pages.Event.Settings.Classes.StartTimes.Form.Time'
    );

    fireEvent.change(dateInput, { target: { value: '2026-06-15' } });
    fireEvent.change(timeInput, { target: { value: '10:12' } });

    expect(dateInput).toHaveValue('2026-06-15');
    expect(timeInput).toHaveValue('10:12');

    await act(async () => {
      rerender(
        <MockedProvider
          mocks={[
            firstClassVacanciesMock,
            competitorStartTimesMock(1),
            secondClassVacanciesMock,
            competitorStartTimesMock(2),
          ]}
        >
          <ClassStartTimesDialog
            t={t}
            classId={2}
            className="D21"
            timezone="Europe/Prague"
            open
            onOpenChange={() => undefined}
          />
        </MockedProvider>
      );
      await Promise.resolve();
    });

    expect(
      screen.getByLabelText('Pages.Event.Settings.Classes.StartTimes.Form.Date')
    ).toHaveValue('');
    expect(
      screen.getByLabelText('Pages.Event.Settings.Classes.StartTimes.Form.Time')
    ).toHaveValue('');
  });
});
