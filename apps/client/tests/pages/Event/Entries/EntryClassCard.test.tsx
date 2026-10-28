import { fireEvent, render, screen } from '@testing-library/react';
import type { EntryAvailabilityClass } from '@repo/shared';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import cs from '@/i18n/locales/cs/translation.json';
import { EntryClassCard } from '@/pages/Event/Entries/EntryClassCard';

const i18n = i18next.createInstance();
const entryClass: EntryAvailabilityClass = {
  id: 1,
  name: 'D21',
  sex: 'F',
  birthYearFrom: 1990,
  birthYearTo: null,
  maxNumberOfCompetitors: 50,
  competitorCount: 10,
  availableCount: 29,
  startMode: 'FreeStart',
  fee: null,
  isFull: false,
  slots: [],
};

beforeAll(async () => {
  await i18n.init({ lng: 'cs', resources: { cs: { translation: cs } } });
});

function setup(count = 29) {
  const onSelect = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <EntryClassCard
        entryClass={{ ...entryClass, availableCount: count }}
        currencyCode="CZK"
        onSelect={onSelect}
      />
    </I18nextProvider>
  );
  return onSelect;
}

describe('EntryClassCard', () => {
  it.each([
    [1, '1 místo'],
    [3, '3 místa'],
    [29, '29 míst'],
    [0, '0 míst'],
  ])('shows server availability with Czech plurals (%s)', (count, label) => {
    setup(count);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-description',
      'Obsazeno 10 z 50 · Ročníky 1990–…'
    );
  });

  it('keeps pointer and keyboard selection available', () => {
    const select = setup();
    const card = screen.getByRole('button');
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(select).toHaveBeenCalledTimes(3);
  });
});
