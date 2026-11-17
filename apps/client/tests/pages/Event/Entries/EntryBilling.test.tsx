import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  toast: vi.fn(),
  getBlob: vi.fn(),
  click: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@apollo/client/react', () => ({
  useMutation: () => [mocks.mutate, { loading: false }],
  useQuery: () => ({
    data: {
      countries: [
        { countryCode: 'CZ', countryName: 'Česká republika' },
        { countryCode: 'DE', countryName: 'Německo' },
      ],
    },
  }),
}));
vi.mock('@/utils', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ getBlob: mocks.getBlob }),
}));
import { EntryPayerCard } from '@/pages/Event/Entries/EntryPayerCard';
import { EntrySettlementDownload } from '@/pages/Event/Entries/EntrySettlementDownload';
const payer = {
  name: 'Club',
  street: 'Main 1',
  city: 'Choceň',
  postalCode: '56501',
  country: 'CZ',
  companyId: '123',
};
beforeEach(() => vi.clearAllMocks());
describe('payer details', () => {
  it('requires complete details before saving and allows clearing optional billing', async () => {
    const onSaved = vi.fn();
    render(<EntryPayerCard entryId="order" payer={null} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Billing.Invalid' })
      )
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        variables: { entryId: 'order', payer: null },
      })
    );
  });
  it('strips Apollo metadata and saves corrected payer details', async () => {
    const onSaved = vi.fn();
    render(
      <EntryPayerCard
        entryId="order"
        payer={{ ...payer, __typename: 'BillingDetails' } as typeof payer}
        onSaved={onSaved}
      />
    );
    fireEvent.change(screen.getByLabelText('Billing.Name'), {
      target: { value: 'New Club' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Billing.Save' }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        variables: { entryId: 'order', payer: { ...payer, name: 'New Club' } },
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
it('accepts nullable optional billing fields returned by GraphQL', () => {
  render(
    <EntryPayerCard
      entryId="order"
      payer={{ ...payer, companyId: null, vatId: null } as never}
      onSaved={vi.fn()}
    />
  );
  expect(screen.getByLabelText('Billing.Name')).toHaveValue('Club');
  expect(screen.getByLabelText('Billing.CompanyId')).toHaveValue('');
});

describe('settlement download', () => {
  it('uses the protected order token without sending account authentication', async () => {
    mocks.getBlob.mockResolvedValue(
      new Blob(['%PDF-test'], { type: 'application/pdf' })
    );
    const create = vi.fn().mockReturnValue('blob:pdf');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() })
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(
      <EntrySettlementDownload eventId="race" entryId="order" access="signed" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Billing.Download' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(mocks.getBlob).toHaveBeenCalledWith(
      '/rest/v1/events/race/entries/order/settlement.pdf?access=signed',
      { skipAuth: true }
    );
    click.mockRestore();
  });
  it('shows a visible error when the PDF cannot be fetched', async () => {
    mocks.getBlob.mockRejectedValue(new Error('Unavailable'));
    render(<EntrySettlementDownload eventId="race" entryId="order" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Billing.Failed' })
      )
    );
  });
});
