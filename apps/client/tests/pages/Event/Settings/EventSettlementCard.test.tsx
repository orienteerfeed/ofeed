import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  toast: vi.fn(),
  query: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/utils', () => ({ toast: mocks.toast }));
vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mocks,
  useMutation: () => [mocks.mutate, { loading: false }],
  useQuery: () => ({
    data: {
      eventSettlementSettings: { enabled: false, organizer: null },
      countries: [
        { countryCode: 'CZ', countryName: 'Česká republika' },
        { countryCode: 'DE', countryName: 'Německo' },
      ],
    },
    loading: false,
  }),
}));
import { EventSettlementCard } from '@/pages/Event/Settings/EventSettlementCard';
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});
describe('organizer settlement settings', () => {
  it('rejects saving incomplete organizer information without an enablement checkbox', async () => {
    render(<EventSettlementCard eventId="race" />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Billing.Invalid' })
      )
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('automatically enables settlements when saving complete company details', async () => {
    render(<EventSettlementCard eventId="race" />);
    for (const [label, value] of Object.entries({
      Name: 'K.O.B. Choceň',
      Street: 'Vostelčická 256',
      City: 'Choceň',
      PostalCode: '56501',
      CompanyId: '15030237',
    })) {
      fireEvent.change(screen.getByLabelText(`Billing.${label}`), {
        target: { value },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            eventId: 'race',
            enabled: true,
            organizer: expect.objectContaining({ companyId: '15030237' }),
          }),
        })
      )
    );
  });
});

const registered = {
  name: 'Test club',
  companyId: '12345678',
  street: 'Hlavní 10',
  city: 'Praha',
  postalCode: '11000',
  country: 'CZ',
  vatId: 'CZ12345678',
};
it('uses the shared country select and removes obsolete organizer controls', async () => {
  render(<EventSettlementCard eventId="race" />);
  const country = screen.getByLabelText('Billing.Country');
  expect(country).toHaveAttribute('role', 'combobox');
  fireEvent.keyDown(country, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: 'Německo' }));
  expect(country).toHaveTextContent('Německo');
  const fields = document.querySelectorAll('input:not([type="hidden"])');
  expect(fields[0]).toBe(screen.getByLabelText('Billing.Name'));
  expect(fields[1]).toBe(screen.getByLabelText('Billing.CompanyId'));
  expect(screen.queryByLabelText('Billing.ClubCode')).not.toBeInTheDocument();
  expect(screen.queryByText('Billing.AccountHint')).not.toBeInTheDocument();
});
it('autocompletes a name, fills fresh detail and clears verification after edits', async () => {
  mocks.query
    .mockResolvedValueOnce({ data: { searchOrganizerAres: [registered] } })
    .mockResolvedValueOnce({ data: { organizerAres: registered } });
  render(<EventSettlementCard eventId="race" />);
  const name = screen.getByLabelText('Billing.Name');
  fireEvent.change(name, { target: { value: 'Test' } });
  await screen.findByRole('option', { name: /Test club/ });
  fireEvent.keyDown(name, { key: 'ArrowDown' });
  fireEvent.keyDown(name, { key: 'Enter' });
  await screen.findByText('Billing.AresVerified');
  expect(screen.getByLabelText('Billing.Street')).toHaveValue('Hlavní 10');
  expect(screen.getByLabelText('Billing.CompanyId')).toHaveValue('12345678');
  expect(screen.getByLabelText('Billing.VatId')).toHaveValue('CZ12345678');
  fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
  expect(
    mocks.mutate.mock.calls.at(-1)?.[0].variables.organizer
  ).not.toHaveProperty('aresVerifiedAt');
  fireEvent.keyDown(screen.getByLabelText('Billing.Country'), {
    key: 'ArrowDown',
  });
  fireEvent.click(await screen.findByRole('option', { name: 'Německo' }));
  expect(screen.queryByText('Billing.AresVerified')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
  expect(mocks.mutate.mock.calls.at(-1)?.[0].variables.organizer.country).toBe(
    'DE'
  );
});
it('loads details from a complete company ID and reports registry outages', async () => {
  mocks.query.mockResolvedValueOnce({ data: { organizerAres: registered } });
  render(<EventSettlementCard eventId="race" />);
  fireEvent.change(screen.getByLabelText('Billing.CompanyId'), {
    target: { value: '12345678' },
  });
  await screen.findByText('Billing.AresVerified');
  expect(screen.getByLabelText('Billing.Name')).toHaveValue('Test club');
  mocks.query.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.change(screen.getByLabelText('Billing.CompanyId'), {
    target: { value: '87654321' },
  });
  await screen.findByText('Billing.AresFailed');
  expect(screen.queryByText('Billing.AresVerified')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
});
it('does not overwrite manual edits with a stale registry response', async () => {
  let resolve: (value: unknown) => void = () => {};
  mocks.query.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    })
  );
  render(<EventSettlementCard eventId="race" />);
  fireEvent.change(screen.getByLabelText('Billing.CompanyId'), {
    target: { value: '12345678' },
  });
  await waitFor(() => expect(mocks.query).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Billing.City'), {
    target: { value: 'Manual city' },
  });
  await act(async () => {
    resolve({ data: { organizerAres: registered } });
  });
  expect(screen.getByLabelText('Billing.City')).toHaveValue('Manual city');
  expect(screen.getByLabelText('Billing.Name')).toHaveValue('');
});
it('reports when ARES finds no matching name', async () => {
  mocks.query.mockResolvedValueOnce({ data: { searchOrganizerAres: [] } });
  render(<EventSettlementCard eventId="race" />);
  fireEvent.change(screen.getByLabelText('Billing.Name'), {
    target: { value: 'Unknown' },
  });
  await screen.findByText('Billing.AresEmpty');
});

it('clears the displayed badge if the server cannot confirm verification on save', async () => {
  mocks.query.mockResolvedValueOnce({ data: { organizerAres: registered } });
  mocks.mutate.mockResolvedValueOnce({
    data: {
      updateEventSettlementSettings: { organizer: { aresVerifiedAt: null } },
    },
  });
  render(<EventSettlementCard eventId="race" />);
  fireEvent.change(screen.getByLabelText('Billing.CompanyId'), {
    target: { value: '12345678' },
  });
  await screen.findByText('Billing.AresVerified');
  fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
  await waitFor(() =>
    expect(screen.queryByText('Billing.AresVerified')).not.toBeInTheDocument()
  );
});
