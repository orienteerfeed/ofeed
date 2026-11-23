import { z } from 'zod';
import { organizerDetailsSchema, type OrganizerDetails } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ValidationError } from '../../exceptions/index.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';

const BASE_URL = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty';
const subjectSchema = z.object({
  ico: z.string().regex(/^\d{8}$/),
  obchodniJmeno: z.string(),
  dic: z.string().nullish(),
  sidlo: z
    .object({
      nazevUlice: z.string().nullish(),
      nazevCastiObce: z.string().nullish(),
      nazevObce: z.string().nullish(),
      cisloDomovni: z.number().nullish(),
      cisloOrientacni: z.number().nullish(),
      cisloOrientacniPismeno: z.string().nullish(),
      cisloDoAdresy: z.string().nullish(),
      psc: z.number().nullish(),
      pscTxt: z.string().nullish(),
      nazevStatu: z.string().nullish(),
      kodStatu: z.string().nullish(),
    })
    .nullish(),
});

export function mapAresOrganizer(input: unknown): OrganizerDetails {
  const subject = subjectSchema.parse(input);
  const address = subject.sidlo;
  const house =
    address?.cisloDoAdresy ||
    [
      address?.cisloDomovni,
      address?.cisloOrientacni == null
        ? null
        : `${address.cisloOrientacni}${address.cisloOrientacniPismeno ?? ''}`,
    ]
      .filter((value) => value != null)
      .join('/');
  return {
    name: subject.obchodniJmeno,
    companyId: subject.ico,
    vatId: subject.dic ?? '',
    street: [address?.nazevUlice || address?.nazevCastiObce || address?.nazevObce, house]
      .filter(Boolean)
      .join(' '),
    city: address?.nazevObce ?? '',
    postalCode: address?.pscTxt || (address?.psc == null ? '' : String(address.psc)),
    country:
      address?.kodStatu === '203' ||
      ['Česká republika', 'Česko'].includes(address?.nazevStatu ?? '')
        ? 'CZ'
        : address?.nazevStatu ?? '',
  };
}

async function requestAres(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('ARES is unavailable.');
  return response.json();
}

export async function fetchAresOrganizer(companyId: string): Promise<OrganizerDetails | null> {
  if (!/^\d{8}$/.test(companyId))
    throw new ValidationError('An eight-digit company ID is required.');
  const data = await requestAres(`/${companyId}`);
  return data === null ? null : mapAresOrganizer(data);
}

export async function lookupAresOrganizer(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  companyId: string,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  return fetchAresOrganizer(companyId.trim());
}

export async function searchAresOrganizers(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  name: string,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const query = z.string().trim().min(3).max(191).safeParse(name);
  if (!query.success) throw new ValidationError('Enter between 3 and 191 characters.');
  const data = await requestAres('/vyhledat', { obchodniJmeno: query.data, start: 0, pocet: 10 });
  if (data === null) return [];
  return z
    .object({ ekonomickeSubjekty: z.array(z.unknown()).default([]) })
    .parse(data)
    .ekonomickeSubjekty.slice(0, 10)
    .map(mapAresOrganizer);
}

const normalizeCzechCountry = (value: string | undefined) =>
  ['CZ', 'Česká republika', 'Česko', 'Czech Republic', 'Czechia'].includes(value ?? '')
    ? 'CZ'
    : value;
const billingKeys = [
  'name',
  'street',
  'city',
  'postalCode',
  'country',
  'companyId',
  'vatId',
] as const;
const normalize = (value: string | undefined) => (value ?? '').trim().replace(/\s+/g, ' ');
export async function verifyAresOrganizer(organizer: OrganizerDetails): Promise<OrganizerDetails> {
  // Verification metadata is server-owned; never trust a submitted timestamp.
  const { aresVerifiedAt: _claimed, ...details } = organizer;
  if (!/^\d{8}$/.test(details.companyId)) return details;
  try {
    const registered = await fetchAresOrganizer(details.companyId);
    if (
      registered &&
      organizerDetailsSchema.safeParse(registered).success &&
      billingKeys.every(
        (key) =>
          normalize(key === 'country' ? normalizeCzechCountry(details[key]) : details[key]) ===
          normalize(key === 'country' ? normalizeCzechCountry(registered[key]) : registered[key]),
      )
    )
      return { ...details, aresVerifiedAt: new Date().toISOString() };
  } catch {
    // Manual settings remain saveable during a registry outage, without verification.
  }
  return details;
}
