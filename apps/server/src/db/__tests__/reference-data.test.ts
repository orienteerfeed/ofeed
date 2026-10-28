import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { seedReferenceData } from '../../../prisma/reference-data.js';

type Country = { countryCode: string; countryName: string };
type Currency = { id: number; name: string; iso4217Alpha3: string; iso4217Num3: number };
type Sport = { id: number; name: string };

function database() {
  const countries = new Map<string, Country>();
  const currencies = new Map<string, Currency>();
  const sports = new Map<string, Sport>();
  let failCountry: string | undefined;
  let nextCurrencyId = 100;
  let nextSportId = 100;
  const client = {
    country: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { countryCode: string };
          create: Country;
          update: Partial<Country>;
        }) => {
          if (where.countryCode === failCountry) throw new Error('Database unavailable');
          const current = countries.get(where.countryCode);
          const row = current ? { ...current, ...update } : { ...create };
          countries.set(where.countryCode, row);
          return row;
        }
      ),
    },
    currency: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { iso4217Alpha3: string };
          create: Omit<Currency, 'id'>;
          update: Partial<Currency>;
        }) => {
          const current = currencies.get(where.iso4217Alpha3);
          const row = current ? { ...current, ...update } : { ...create, id: nextCurrencyId++ };
          currencies.set(where.iso4217Alpha3, row);
          return row;
        }
      ),
    },
    sport: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { name: string };
          create: Omit<Sport, 'id'>;
          update: Partial<Sport>;
        }) => {
          const current = sports.get(where.name);
          const row = current ? { ...current, ...update } : { ...create, id: nextSportId++ };
          sports.set(where.name, row);
          return row;
        }
      ),
    },
    event: { create: vi.fn() },
    user: { create: vi.fn() },
  };
  return {
    countries,
    currencies,
    sports,
    client,
    prisma: client as unknown as Pick<PrismaClient, 'currency' | 'sport' | 'country'>,
    failOnCountry(code?: string) {
      failCountry = code;
    },
  };
}

describe('deployment reference data', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('populates application reference data without creating events or users', async () => {
    vi.stubEnv('EVENT_NAME', 'Must not be created during deployment');
    const db = database();
    await seedReferenceData(db.prisma);
    expect(db.countries.get('CZ')?.countryName).toBe('Czech Republic');
    expect(db.countries.size).toBeGreaterThan(200);
    expect(db.currencies.get('EUR')?.iso4217Num3).toBe(978);
    expect(db.currencies.size).toBe(22);
    expect(db.sports.has('Orienteering')).toBe(true);
    expect(db.client.event.create).not.toHaveBeenCalled();
    expect(db.client.user.create).not.toHaveBeenCalled();
  });

  it('preserves existing reference IDs, country names and unrelated records on repeated runs', async () => {
    const db = database();
    db.currencies.set('CZK', { id: 1, name: 'Koruna', iso4217Alpha3: 'CZK', iso4217Num3: 203 });
    db.sports.set('Orienteering', { id: 42, name: 'Orienteering' });
    db.sports.set('Cycling', { id: 43, name: 'Cycling' });
    db.countries.set('CZ', { countryCode: 'CZ', countryName: 'Česko' });
    const sport = await seedReferenceData(db.prisma);
    const first = JSON.stringify([...db.countries, ...db.currencies, ...db.sports]);
    await seedReferenceData(db.prisma);
    expect(JSON.stringify([...db.countries, ...db.currencies, ...db.sports])).toBe(first);
    expect(sport.id).toBe(42);
    expect(db.currencies.get('CZK')?.id).toBe(1);
    expect(db.countries.get('CZ')?.countryName).toBe('Česko');
    expect(db.sports.get('Cycling')?.id).toBe(43);
  });

  it('reports database errors and can complete a partially seeded database on retry', async () => {
    const db = database();
    db.failOnCountry('CZ');
    await expect(seedReferenceData(db.prisma)).rejects.toThrow('Database unavailable');
    expect(db.countries.has('CZ')).toBe(false);
    const partialCount = db.countries.size;
    const currencyId = db.currencies.get('EUR')?.id;
    db.failOnCountry();
    await seedReferenceData(db.prisma);
    expect(db.countries.has('CZ')).toBe(true);
    expect(db.countries.size).toBeGreaterThan(partialCount);
    expect(db.currencies.get('EUR')?.id).toBe(currencyId);
    expect(db.currencies.size).toBe(22);
  });
});
