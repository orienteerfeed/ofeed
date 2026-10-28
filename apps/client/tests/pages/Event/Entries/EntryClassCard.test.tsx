import { fireEvent, render, screen } from '@testing-library/react';
import type { EntryAvailabilityClass } from '@repo/shared';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import cs from '@/i18n/locales/cs/translation.json';
import de from '@/i18n/locales/de/translation.json';
import en from '@/i18n/locales/en/translation.json';
import es from '@/i18n/locales/es/translation.json';
import fr from '@/i18n/locales/fr/translation.json';
import sv from '@/i18n/locales/sv/translation.json';
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
  await i18n.init({
    lng: 'cs',
    resources: Object.fromEntries(
      Object.entries({ cs, de, en, es, fr, sv }).map(
        ([language, translation]) => [language, { translation }]
      )
    ),
  });
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
    [-1, '0 míst'],
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

  it.each([
    ['en', '1 place', '29 places', 'Occupied 10 of 50'],
    ['de', '1 Platz', '29 Plätze', '10 von 50 belegt'],
    ['es', '1 plaza', '29 plazas', '10 de 50 ocupadas'],
    ['fr', '1 place', '29 places', '10 sur 50 occupées'],
    ['sv', '1 plats', '29 platser', '10 av 50 upptagna'],
  ])(
    'renders translated availability in %s',
    async (language, one, many, occupancy) => {
      await i18n.changeLanguage(language);
      try {
        setup(1);
        expect(screen.getByText(one)).toBeInTheDocument();
        expect(
          screen.getByRole('button').getAttribute('aria-description')
        ).toContain(occupancy);
        expect(
          i18n.t('Pages.Event.Entries.PlacesRemaining', { count: 29 })
        ).toBe(many);
      } finally {
        await i18n.changeLanguage('cs');
      }
    }
  );
});
