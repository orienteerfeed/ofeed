import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedReferenceData } from './reference-data.js';

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed reference data');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
  try {
    await seedReferenceData(prisma);
    console.log('Reference data seeded: currencies, countries and Orienteering sport.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
