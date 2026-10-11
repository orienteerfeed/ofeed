import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnsureRegistrationsSynchronized = vi.hoisted(() => vi.fn(async () => true));
const mockEnsureClubsSynchronized = vi.hoisted(() => vi.fn(async () => true));
const mockLookupByRegistration = vi.hoisted(() => vi.fn());
const mockLookupByCard = vi.hoisted(() => vi.fn());
const mockSearchClubs = vi.hoisted(() => vi.fn());

vi.mock('../registration.service.js', () => ({
  ensureRegistrationsSynchronized: mockEnsureRegistrationsSynchronized,
  ensureClubsSynchronized: mockEnsureClubsSynchronized,
  lookupByRegistration: mockLookupByRegistration,
  lookupByCard: mockLookupByCard,
  searchClubs: mockSearchClubs,
}));

import registrationRoutes from '../registration.routes.js';

const REGISTRATION_MATCH = {
  source: 'ORIS',
  externalId: '33',
  registration: 'ABM6707',
  firstname: 'Libor',
  lastname: 'Adamek',
  birthYear: 1967,
  license: 'C',
  organisation: 'KOB ALFA Brno',
  gender: 'M',
  card: 207849,
};

describe('GET /lookup', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureRegistrationsSynchronized.mockResolvedValue(true);
    mockEnsureClubsSynchronized.mockResolvedValue(true);
    app = new Hono();
    app.route('/', registrationRoutes as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 422 when neither registration nor card is provided', async () => {
    const res = await app.request('/lookup');
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe(true);
  });

  it('returns 422 when both registration and card are provided', async () => {
    const res = await app.request('/lookup?registration=ABM6707&card=207849');
    expect(res.status).toBe(422);
  });

  it('returns 422 for a malformed registration', async () => {
    const res = await app.request('/lookup?registration=bad');
    expect(res.status).toBe(422);
  });

  it('looks up by registration and never returns the SI card', async () => {
    mockLookupByRegistration.mockResolvedValue([REGISTRATION_MATCH]);

    const res = await app.request('/lookup?registration=ABM6707');

    expect(res.status).toBe(200);
    expect(mockEnsureRegistrationsSynchronized).toHaveBeenCalledWith({
      sport: 'OB',
      year: new Date().getFullYear(),
    });
    expect(mockLookupByRegistration).toHaveBeenCalledWith('ABM6707', {
      source: 'ORIS',
      sport: 'OB',
      year: new Date().getFullYear(),
    });
    const json = await res.json();
    expect(json.results.data).toEqual([REGISTRATION_MATCH]);
  });

  it('looks up by card number', async () => {
    mockLookupByCard.mockResolvedValue([REGISTRATION_MATCH]);

    const res = await app.request('/lookup?card=207849');

    expect(res.status).toBe(200);
    expect(mockLookupByCard).toHaveBeenCalledWith(207849, {
      source: 'ORIS',
      sport: 'OB',
      year: new Date().getFullYear(),
    });
  });

  it('filters by source and does not run the ORIS sync for another cached source', async () => {
    mockLookupByRegistration.mockResolvedValue([]);

    const res = await app.request('/lookup?registration=ABM6707&source=EVENTOR');

    expect(res.status).toBe(200);
    expect(mockEnsureRegistrationsSynchronized).not.toHaveBeenCalled();
    expect(mockLookupByRegistration).toHaveBeenCalledWith('ABM6707', {
      source: 'EVENTOR',
      sport: 'OB',
      year: new Date().getFullYear(),
    });
  });

  it('serves cached data when the ORIS sync fails', async () => {
    mockEnsureRegistrationsSynchronized.mockRejectedValue(new Error('ORIS unreachable'));
    mockLookupByRegistration.mockResolvedValue([REGISTRATION_MATCH]);

    const res = await app.request('/lookup?registration=ABM6707');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.data).toEqual([REGISTRATION_MATCH]);
  });
});

describe('GET /clubs', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureClubsSynchronized.mockResolvedValue(true);
    app = new Hono();
    app.route('/', registrationRoutes as never);
  });

  it('returns the club search results', async () => {
    mockSearchClubs.mockResolvedValue([
      { source: 'ORIS', externalId: '1', name: 'KOB ALFA Brno', abbr: 'ABM', region: null },
    ]);

    const res = await app.request('/clubs?q=alfa');

    expect(res.status).toBe(200);
    expect(mockSearchClubs).toHaveBeenCalledWith('alfa', 50);
  });

  it('serves cached clubs when the ORIS sync fails', async () => {
    mockEnsureClubsSynchronized.mockRejectedValue(new Error('ORIS unreachable'));
    mockSearchClubs.mockResolvedValue([]);

    const res = await app.request('/clubs');

    expect(res.status).toBe(200);
  });
});
