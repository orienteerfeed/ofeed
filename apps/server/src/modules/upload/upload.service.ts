import { parse } from 'csv-parse/sync';
import type { CzechRankingCategory, CzechRankingType } from '../../generated/prisma/client.js';

import { DatabaseError } from '../../exceptions/index.js';
import prisma from '../../utils/context.js';

export function normalizeCzechRankingMonthInput(input: string): Date | null {
  const normalized = input.trim();
  const match = normalized.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

export const storeCzechRankingData = async ({
  csvData,
  rankingType,
  rankingCategory,
  validForMonth,
}: {
  csvData: string;
  rankingType: CzechRankingType;
  rankingCategory: CzechRankingCategory;
  validForMonth: Date;
}) => {
  // Parsing CSV string into an array of objects
  const records = parse(csvData, {
    from_line: 2, // Start parsing from the second line
    skip_empty_lines: true, // Skip empty lines in the input string
    trim: true, // Trim whitespace from fields
    delimiter: ';',
  });

  const rankingEntries = records
    .map((record) => ({
      rankingType,
      rankingCategory,
      validForMonth,
      place: Number.parseInt(record[0], 10),
      lastName: record[1],
      firstName: record[2],
      registration: String(record[3]).trim().toUpperCase(),
      points: Number.parseInt(record[4], 10),
      rankIndex: Number.parseInt(record[5], 10),
    }))
    .filter((entry) => entry.registration?.trim());

  try {
    await prisma.$transaction([
      prisma.rankingCzech.deleteMany({
        where: {
          rankingType,
          rankingCategory,
          validForMonth,
        },
      }),
      prisma.rankingCzech.createMany({
        data: rankingEntries,
      }),
    ]);
  } catch (err) {
    console.error(err);
    throw new DatabaseError(`An error occurred: ` + err.message);
  }

  return rankingEntries.length;
};
