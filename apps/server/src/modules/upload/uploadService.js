import { parse } from 'csv-parse/sync';

import { DatabaseError } from '../../exceptions/index.js';
import prisma from '../../utils/context.js';

export const storeCzechRankingData = async (csvData) => {
  // Parsing CSV string into an array of objects
  const records = parse(csvData, {
    from_line: 2, // Start parsing from the second line
    skip_empty_lines: true, // Skip empty lines in the input string
    trim: true, // Trim whitespace from fields
    delimiter: ';',
  });

  let affectedRecords = 0;
  for (const record of records) {
    try {
      const rankingRecord = await prisma.rankingCzech.upsert({
        where: { registration: record[3] },
        update: {
          place: parseInt(record[0]),
          firstName: record[2],
          lastName: record[1],
          points: parseInt(record[4]),
          rankIndex: parseInt(record[5]),
        },
        create: {
          place: parseInt(record[0]),
          firstName: record[2],
          lastName: record[1],
          registration: record[3],
          points: parseInt(record[4]),
          rankIndex: parseInt(record[5]),
        },
      });
      affectedRecords++;
      console.log(`Created ranking record with id: ${rankingRecord.id}`);
    } catch (err) {
      console.error(err);
      throw new DatabaseError(`An error occurred: ` + err.message);
    }
  }

  return affectedRecords;
};
