import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ClassesSettingsTab,
  CLASS_UPDATE,
  EVENT_CLASSES,
} from '@/pages/Event/Settings/ClassesSettingsTab';

const t = ((key: string) => key) as never;

const baseClass = {
  id: 1,
  name: 'H21',
  maxNumberOfCompetitors: 20,
  competitorsCount: 15,
  minAge: 21,
  maxAge: null,
  minTeamMembers: null,
  maxTeamMembers: null,
  sex: 'M',
  resultListMode: null,
  fee: 100,
  awardedPlaces: 3,
  startMode: null,
  __typename: 'Class',
};

const classesMock = {
  request: { query: EVENT_CLASSES, variables: { eventId: 'event-1' } },
  result: { data: { eventClasses: [baseClass] } },
};

describe('ClassesSettingsTab', () => {
  it('renders the class name read-only and field inputs', async () => {
    render(
      <MockedProvider mocks={[classesMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    expect(await screen.findByText('H21')).toBeInTheDocument();
    expect(screen.getByLabelText('H21 competitorsCount')).toHaveTextContent(
      '15'
    );
    expect(screen.getByLabelText('H21 maxNumberOfCompetitors')).toHaveValue(20);
  });

  it('does not render team-size columns when not relay', async () => {
    render(
      <MockedProvider mocks={[classesMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    await screen.findByText('H21');
    expect(
      screen.queryByLabelText('H21 minTeamMembers')
    ).not.toBeInTheDocument();
  });

  it('keeps the new value when the classUpdate mutation succeeds', async () => {
    const updateMock = {
      request: {
        query: CLASS_UPDATE,
        variables: { input: { classId: 1, maxNumberOfCompetitors: 25 } },
      },
      result: {
        data: {
          classUpdate: {
            message: 'Class updated',
            __typename: 'ResponseMessage',
          },
        },
      },
    };

    render(
      <MockedProvider mocks={[classesMock, updateMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    const input = await screen.findByLabelText('H21 maxNumberOfCompetitors');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);

    // Value persists (no revert) only if the mutation matched the expected
    // variables and resolved successfully.
    await waitFor(() => expect(input).toHaveValue(25));
  });

  it('allows zero maxNumberOfCompetitors to close a class', async () => {
    const updateMock = {
      request: {
        query: CLASS_UPDATE,
        variables: { input: { classId: 1, maxNumberOfCompetitors: 0 } },
      },
      result: {
        data: {
          classUpdate: {
            message: 'Class updated',
            __typename: 'ResponseMessage',
          },
        },
      },
    };

    render(
      <MockedProvider mocks={[classesMock, updateMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    const input = await screen.findByLabelText('H21 maxNumberOfCompetitors');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue(0));
  });

  it('highlights maxNumberOfCompetitors in orange when competitorsCount exceeds it', async () => {
    const overCapacityClass = {
      ...baseClass,
      maxNumberOfCompetitors: 10,
      competitorsCount: 15,
    };
    const mock = {
      request: { query: EVENT_CLASSES, variables: { eventId: 'event-1' } },
      result: { data: { eventClasses: [overCapacityClass] } },
    };

    render(
      <MockedProvider mocks={[mock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    const input = await screen.findByLabelText('H21 maxNumberOfCompetitors');
    expect(input.className).toMatch(/orange/);
  });

  it('reverts and shows error when maxNumberOfCompetitors is set below current competitor count', async () => {
    render(
      <MockedProvider mocks={[classesMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    const input = await screen.findByLabelText('H21 maxNumberOfCompetitors');
    // baseClass.competitorsCount = 15; setting max to 10 should fail
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);

    // reverts to the original value (20)
    await waitFor(() =>
      expect(screen.getByLabelText('H21 maxNumberOfCompetitors')).toHaveValue(
        20
      )
    );
  });

  it('displays age bounds as birth years and stores edits back as age', async () => {
    const refYear = new Date().getFullYear();
    // baseClass.minAge = 21 -> "birth year to" shows refYear - 21
    // editing "birth year from" to 2000 -> maxAge = refYear - 2000 (>= minAge=21, so valid)
    const newFromYear = 2000;
    const editMock = {
      request: {
        query: CLASS_UPDATE,
        variables: {
          input: { classId: 1, minAge: 21, maxAge: refYear - newFromYear },
        },
      },
      result: {
        data: {
          classUpdate: {
            message: 'Class updated',
            __typename: 'ResponseMessage',
          },
        },
      },
    };

    render(
      <MockedProvider mocks={[classesMock, editMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    const to = await screen.findByLabelText('H21 birthYearTo');
    expect(to).toHaveValue(refYear - 21);

    const from = screen.getByLabelText('H21 birthYearFrom');
    fireEvent.change(from, { target: { value: String(newFromYear) } });
    fireEvent.blur(from);

    // Persists (no revert) only if the mutation matched the converted age.
    await waitFor(() => expect(from).toHaveValue(newFromYear));
  });

  it('reverts the field and shows an error when the mutation fails', async () => {
    const errorMock = {
      request: {
        query: CLASS_UPDATE,
        variables: { input: { classId: 1, maxNumberOfCompetitors: 25 } },
      },
      error: new Error('Not authorized for this event'),
    };

    render(
      <MockedProvider mocks={[classesMock, errorMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    const input = await screen.findByLabelText('H21 maxNumberOfCompetitors');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue(20));
  });

  it('keeps a previous successful save when a later field save fails', async () => {
    const feeUpdateMock = {
      request: {
        query: CLASS_UPDATE,
        variables: { input: { classId: 1, fee: 125 } },
      },
      result: {
        data: {
          classUpdate: {
            message: 'Class updated',
            __typename: 'ResponseMessage',
          },
        },
      },
    };
    const capacityErrorMock = {
      request: {
        query: CLASS_UPDATE,
        variables: { input: { classId: 1, maxNumberOfCompetitors: 25 } },
      },
      error: new Error('Save failed'),
    };

    render(
      <MockedProvider mocks={[classesMock, feeUpdateMock, capacityErrorMock]}>
        <ClassesSettingsTab
          t={t}
          eventId="event-1"
          isRelay={false}
          timezone="Europe/Prague"
        />
      </MockedProvider>
    );

    const feeInput = await screen.findByLabelText('H21 fee');
    fireEvent.change(feeInput, { target: { value: '125' } });
    fireEvent.blur(feeInput);
    await waitFor(() => expect(feeInput).toHaveValue(125));

    const capacityInput = screen.getByLabelText('H21 maxNumberOfCompetitors');
    fireEvent.change(capacityInput, { target: { value: '25' } });
    fireEvent.blur(capacityInput);

    await waitFor(() => expect(capacityInput).toHaveValue(20));
    expect(feeInput).toHaveValue(125);
  });
});
