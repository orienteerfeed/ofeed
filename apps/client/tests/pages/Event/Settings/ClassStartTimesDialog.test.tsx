import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CLASS_START_SLOT_VACANCIES,
  ClassStartTimesDialog,
} from '@/pages/Event/Settings/ClassStartTimesDialog';

const t = ((key: string) => key) as never;

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
      <MockedProvider mocks={[vacanciesMock]}>
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
});
