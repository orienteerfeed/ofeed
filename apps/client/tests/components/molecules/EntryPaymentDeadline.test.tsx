import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryPaymentDeadline } from '@/components/molecules/EntryPaymentDeadline';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options: { date: string }) => `Deadline: ${options.date}`,
    i18n: { language: 'cs' },
  }),
}));
const entry = {
  status: 'RECEIVED',
  paid: false,
  paymentMethod: 'QR_PAYMENT',
  paymentDueAt: '2026-10-29T12:00:00Z',
};
describe('payment deadline notice', () => {
  it('shows the localized deadline for unpaid received orders', () => {
    render(<EntryPaymentDeadline entry={entry} />);
    expect(screen.getByRole('status').textContent).toContain(
      new Date(entry.paymentDueAt).toLocaleString('cs')
    );
  });
  it.each([
    { paid: true },
    { paymentMethod: 'CASH' },
    { status: 'CANCELLED' },
    { status: 'APPROVED' },
    { paymentDueAt: null },
  ])('hides ineligible notices: %o', override => {
    render(<EntryPaymentDeadline entry={{ ...entry, ...override }} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
