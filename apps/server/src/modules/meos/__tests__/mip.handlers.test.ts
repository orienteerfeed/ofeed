import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  eventMeosBinding: { findFirst: vi.fn() },
  eventPassword: { findFirst: vi.fn() },
  protocol: { findMany: vi.fn() },
  competitor: { findMany: vi.fn() },
}));

vi.mock('../../../utils/context.js', () => ({ default: mockPrisma }));

vi.mock('../../../lib/crypto/encryption.js', () => ({
  decrypt: vi.fn((buf: Buffer) => buf.toString('utf8')),
  decodeBase64: vi.fn((s: string) => Buffer.from(s, 'base64')),
}));

import { Hono } from 'hono';
import { registerMeosMipHandler } from '../mip.handlers.js';

function buildApp() {
  const app = new Hono();
  const subRouter = new Hono();
  registerMeosMipHandler(subRouter as never);
  app.route('/rest/v1/meos', subRouter);
  return app;
}

const ACTIVE_EVENT_PASSWORD = {
  password: Buffer.from('secret').toString('base64'),
  expiresAt: new Date('2999-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.eventMeosBinding.findFirst.mockResolvedValue({ id: 42, eventId: 'event-1' });
  mockPrisma.eventPassword.findFirst.mockResolvedValue(ACTIVE_EVENT_PASSWORD);
  mockPrisma.protocol.findMany.mockResolvedValue([]);
  mockPrisma.competitor.findMany.mockResolvedValue([]);
});

function poll(headers: Record<string, string> = {}) {
  return buildApp().request('/rest/v1/meos/mip', {
    method: 'GET',
    headers,
  });
}

describe('GET /rest/v1/meos/mip', () => {
  it('returns 400 with empty MIP XML when competition header is missing', async () => {
    const res = await poll({ lastid: '17' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/xml/);
    expect(await res.text()).toContain('status="BADCMP"');
  });

  it('uses the MeOS binding event for authorization and response data', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(null);

    const res = await poll({ competition: '42', lastid: '0', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADCMP"');
    expect(mockPrisma.eventMeosBinding.findFirst).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { id: true, eventId: true },
    });
  });

  it('returns BADPWD when pwd header is missing', async () => {
    const res = await poll({ competition: '42', lastid: '0' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/xml/);
    expect(await res.text()).toContain('status="BADPWD"');
  });

  it('returns BADPWD when the event password does not match', async () => {
    const res = await poll({ competition: '42', lastid: '0', pwd: 'wrong' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADPWD"');
  });

  it('returns BADPWD when no EventPassword is configured', async () => {
    mockPrisma.eventPassword.findFirst.mockResolvedValue(null);

    const res = await poll({ competition: '42', lastid: '0', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADPWD"');
  });

  it('returns BADPWD when EventPassword is expired', async () => {
    mockPrisma.eventPassword.findFirst.mockResolvedValue({
      password: Buffer.from('secret').toString('base64'),
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });

    const res = await poll({ competition: '42', lastid: '0', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADPWD"');
  });

  it('returns current entry snapshots for supported protocol rows newer than lastid', async () => {
    mockPrisma.protocol.findMany.mockResolvedValue([
      { id: 5, competitorId: 101 },
      { id: 6, competitorId: 101 },
      { id: 7, competitorId: 102 },
      { id: 8, competitorId: 103 },
      { id: 9, competitorId: 104 },
    ]);
    mockPrisma.competitor.findMany.mockResolvedValue([
      {
        id: 101,
        externalId: '23',
        firstname: 'Olof',
        lastname: 'Snowman',
        nationality: 'SWE',
        card: 12345,
        bibNumber: 77,
        rankingPoints: 1501,
        note: 'Fast & steady',
        status: 'DidNotStart',
        organisation: { name: 'IF Thor' },
        class: {
          externalId: '17',
          name: 'H21',
        },
      },
      {
        id: 102,
        externalId: 'ext&2',
        firstname: 'Elsa',
        lastname: 'Queen',
        nationality: null,
        card: null,
        bibNumber: null,
        rankingPoints: null,
        note: null,
        status: 'OK',
        organisation: { name: 'Arendal <Wayfinders>' },
        class: {
          externalId: null,
          name: 'Open',
        },
      },
      {
        id: 103,
        externalId: '24',
        firstname: 'Anna',
        lastname: 'Active',
        nationality: 'CZE',
        card: 98765,
        bibNumber: 88,
        rankingPoints: null,
        note: 'Checked in',
        status: 'Active',
        organisation: null,
        class: {
          externalId: '17',
          name: 'H21',
        },
      },
      {
        id: 104,
        externalId: '25',
        firstname: 'No',
        lastname: 'Card',
        nationality: null,
        card: null,
        bibNumber: 89,
        rankingPoints: null,
        note: null,
        status: 'Active',
        organisation: null,
        class: {
          externalId: '17',
          name: 'H21',
        },
      },
    ]);

    const res = await poll({ competition: '42', lastid: '4', pwd: 'secret' });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain('xmlns="http://www.melin.nu/mip"');
    expect(text).toContain('firstid="5"');
    expect(text).toContain('lastid="9"');
    expect(text).toContain('<entry localId="23" classid="17">');
    expect(text).toContain('<name nationality="SWE">Snowman, Olof</name>');
    expect(text).not.toContain('starttime=');
    expect(text).toContain('<status>NS</status>');
    expect(text).toContain('<card>12345</card>');
    expect(text).toContain('<bib>77</bib>');
    expect(text).toContain('<rank>1501</rank>');
    expect(text).toContain('<text>Fast &amp; steady</text>');
    expect(text).toContain('<entry id="102" extId="ext&amp;2" classname="Open">');
    expect(text).toContain('<club>Arendal &lt;Wayfinders&gt;</club>');
    expect(text).toContain('<entry localId="24" classid="17">');
    expect(text).toContain('<name nationality="CZE">Active, Anna</name>');
    expect(text).toContain('<bib>88</bib>');
    expect(text).toContain('<text>Checked in</text>');
    expect(text).not.toContain('<status>Active</status>');
    expect(text).toContain('<p code="0" card="98765" time="0"/>');
    expect(text).toContain('<entry localId="25" classid="17">');
    expect(text).toContain('<name>Card, No</name>');
    expect(text).toContain('<p code="0" sno="89" time="0"/>');

    expect(mockPrisma.protocol.findMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        id: { gt: 4 },
        origin: { not: 'IT' },
        type: {
          in: [
            'competitor_create',
            'class_change',
            'firstname_change',
            'lastname_change',
            'bibNumber_change',
            'nationality_change',
            'organisation_change',
            'short_name_change',
            'si_card_change',
            'status_change',
          ],
        },
      },
      orderBy: { id: 'asc' },
      take: 500,
      select: { id: true, competitorId: true },
    });
  });

  it('keeps incoming lastid when there are no changes', async () => {
    const res = await poll({ competition: '42', lastid: '8', pwd: 'secret' });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('lastid="8"');
    expect(text).not.toContain('<entry');
  });
});
