import { describe, expect, it } from 'vitest';
import type { CardInsightCompetitor, EventCardInsight } from '@repo/shared';
import {
  cardInsightClasses,
  cardInsightPrintHtml,
  filterCardInsight,
  summarizeCardInsight,
} from '@/pages/Event/Insights/card-insight.utils';

const row = (id: number, classId = 1): CardInsightCompetitor => ({
  id,
  classId,
  className: `Class ${classId}`,
  firstname: 'Jan',
  lastname: `Name ${id}`,
  registration: `REG${id}`,
  bibNumber: id,
  organisation: 'Club',
  card: null,
});
const report: EventCardInsight = {
  missingCards: [row(2), row(1)],
  duplicateCards: [
    {
      card: 900,
      competitors: [
        { ...row(5, 2), card: 900 },
        { ...row(4), card: 900 },
      ],
    },
    {
      card: 12,
      competitors: [
        { ...row(6), card: 12 },
        { ...row(7), card: 12 },
      ],
    },
  ],
};
describe('card insight filters and exports', () => {
  it('sorts without mutating source data and summarizes every matching row/group', () => {
    const result = filterCardInsight(report, { search: '', classId: '' });
    expect(result.missingCards.map(item => item.id)).toEqual([1, 2]);
    expect(result.duplicateCards.map(group => group.card)).toEqual([12, 900]);
    expect(result.duplicateCards[1]?.competitors.map(item => item.id)).toEqual([
      4, 5,
    ]);
    expect(report.missingCards[0]?.id).toBe(2);
    expect(summarizeCardInsight(result)).toEqual({
      missing: 2,
      duplicateNumbers: 2,
      duplicateCompetitors: 4,
    });
    expect(cardInsightClasses(report)).toEqual([
      [1, 'Class 1'],
      [2, 'Class 2'],
    ]);
  });
  it('retains the full cross-class group when one member matches all filters', () => {
    const result = filterCardInsight(report, {
      search: ' reg5 ',
      classId: '2',
    });
    expect(result.missingCards).toEqual([]);
    expect(result.duplicateCards[0]?.competitors.map(item => item.id)).toEqual([
      4, 5,
    ]);
    expect(
      filterCardInsight(report, { search: 'reg4', classId: '2' }).duplicateCards
    ).toEqual([]);
  });
  it('searches names, registration, club, bib and chip number', () => {
    for (const search of ['Jan Name 5', 'Name 5 Jan', 'REG5', '900']) {
      expect(
        filterCardInsight(report, { search, classId: '' }).duplicateCards
      ).toHaveLength(1);
    }
    expect(
      filterCardInsight(report, { search: 'club', classId: '' }).missingCards
    ).toHaveLength(2);
    expect(
      filterCardInsight(report, { search: '2', classId: '' }).missingCards
    ).toHaveLength(1);
  });
  it('escapes HTML in titles, language and every printed cell', () => {
    const html = cardInsightPrintHtml('<chips>', '"en', [
      [['<script>', 'a&b']],
    ]);
    expect(html).toContain('&lt;chips&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&amp;b');
    expect(html).toContain('lang="&quot;en"');
    expect(html).not.toContain('<script>');
  });
});
