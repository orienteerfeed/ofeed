import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  buildSettlementData,
  downloadEntrySettlement,
  renderSettlementPdf,
} from '../entry-settlement.service.js';
import { createEntryOrderAccessToken } from '../entry-public-access.js';
import { billingDetailsSchema, settlementSettingsSchema } from '@repo/shared';
import { ConflictError } from '../../../exceptions/index.js';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const organizer = {
  name: 'K.O.B. Choceň, z.s.',
  street: 'Vostelčická 256',
  city: 'Choceň',
  postalCode: '565 01',
  country: 'Česká republika',
  companyId: '15030237',
  clubCode: 'CHC',
};
function fixture(changes: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    eventId: 'race',
    status: 'PROCESSED',
    paid: false,
    event: {
      name: 'Oblastní žebříček',
      date: new Date('2026-11-01T09:00:00Z'),
      timezone: 'Europe/Prague',
      settlementEnabled: true,
      organizerDetails: organizer,
      bankAccountIban: 'CZ6520100000002700938285',
    },
    payerDetails: organizer,
    contactFirstname: 'Jana',
    contactLastname: 'Nováková',
    paymentReference: '9990607',
    currency: 'CZK',
    totalAmount: decimal(390),
    items: [{ fee: decimal(390), cardRentalFee: null }],
    addOnItems: [],
    payments: [],
    promoDiscountAmount: null,
    priceAdjustment: null,
    ...changes,
  } as unknown as Parameters<typeof buildSettlementData>[0];
}
describe('entry settlement', () => {
  it('validates complete billing details and organizer enablement', () => {
    expect(billingDetailsSchema.safeParse(organizer).success).toBe(true);
    expect(buildSettlementData(fixture()).organizer).not.toHaveProperty('clubCode');
    expect(billingDetailsSchema.safeParse({ ...organizer, street: ' ' }).success).toBe(false);
    expect(settlementSettingsSchema.safeParse({ enabled: true, organizer: null }).success).toBe(
      false,
    );
    expect(settlementSettingsSchema.safeParse({ enabled: false, organizer: null }).success).toBe(
      true,
    );
  });
  it('uses actual cash and QR receipts and preserves exact decimals', () => {
    const data = buildSettlementData(
      fixture({
        totalAmount: decimal('390.30'),
        items: [{ fee: decimal('390.30'), cardRentalFee: null }],
        payments: [
          { method: 'QR', amount: decimal('100.10'), currency: 'CZK' },
          { method: 'CASH', amount: decimal('200.20'), currency: 'CZK' },
        ],
      }),
    );
    expect(data.transfer.toString()).toBe('100.1');
    expect(data.cash.toString()).toBe('200.2');
    expect(data.balance.toString()).toBe('90');
  });
  it('reconciles rentals, services, discounts and corrections', () => {
    const data = buildSettlementData(
      fixture({
        totalAmount: decimal(450),
        items: [{ fee: decimal(400), cardRentalFee: decimal(50) }],
        addOnItems: [{ price: decimal(30), quantity: 2, service: { name: 'Parkování' } }],
        promoDiscountAmount: decimal(40),
        priceAdjustment: decimal(-20),
      }),
    );
    expect(data.lines.map((line) => line.amount.toString())).toEqual([
      '400',
      '50',
      '60',
      '-40',
      '-20',
    ]);
    expect(data.balance.toString()).toBe('450');
    expect(() => buildSettlementData(fixture({ totalAmount: decimal(500) }))).toThrow(
      ConflictError,
    );
  });
  it('does not invent historical payments or refunds', () => {
    const legacy = buildSettlementData(fixture({ paid: true, payerDetails: null }));
    expect(legacy.undocumentedPaid).toBe(true);
    expect(legacy.payer).toEqual({ name: 'Jana Nováková' });
    expect(legacy.balance.toString()).toBe('390');
    const overpaid = buildSettlementData(
      fixture({ payments: [{ method: 'CASH', amount: decimal(400), currency: 'CZK' }] }),
    );
    expect(overpaid.balance.toString()).toBe('-10');
    const free = buildSettlementData(fixture({ paid: true, totalAmount: decimal(0), items: [] }));
    expect(free.undocumentedPaid).toBe(false);
    expect(free.balance.isZero()).toBe(true);
  });
  it('rejects unprocessed, disabled and wrong-currency records', () => {
    expect(() => buildSettlementData(fixture({ status: 'APPROVED' }))).toThrow(ConflictError);
    const entry = fixture();
    entry.event.settlementEnabled = false;
    expect(() => buildSettlementData(entry)).toThrow(ConflictError);
    expect(() =>
      buildSettlementData(
        fixture({ payments: [{ method: 'QR', amount: decimal(390), currency: 'EUR' }] }),
      ),
    ).toThrow(ConflictError);
  });
  it('renders Unicode fonts and large multi-page documents as real PDFs', async () => {
    const data = buildSettlementData(fixture());
    data.lines = Array.from({ length: 120 }, (_, i) => ({
      label: `Doplňková služba ${i}: ${'Český žebříček '.repeat(6)}`,
      amount: decimal('0.10'),
    }));
    const pdf = await renderSettlementPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('/FontFile2');
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
  it('authorizes only owner/admin or a valid token for this exact order', async () => {
    const entry = fixture();
    const prisma = {
      entry: { findFirst: vi.fn().mockResolvedValue(entry) },
      event: { findUnique: vi.fn().mockResolvedValue({ authorId: 7 }) },
      user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
    };
    const client = prisma as unknown as Parameters<typeof downloadEntrySettlement>[0];
    const guest = { isAuthenticated: false };
    for (const token of [
      undefined,
      'bad',
      createEntryOrderAccessToken('other', new Date('2099-01-01')),
      createEntryOrderAccessToken('entry-1', new Date('2020-01-01')),
    ]) {
      await expect(
        downloadEntrySettlement(client, guest, 'race', 'entry-1', token),
      ).rejects.toThrow();
    }
    expect(prisma.entry.findFirst).not.toHaveBeenCalled();
    const token = createEntryOrderAccessToken('entry-1', new Date('2099-01-01'));
    const result = await downloadEntrySettlement(client, guest, 'race', 'entry-1', token);
    expect(result.filename).toBe('vyuctovani-9990607.pdf');
    expect(prisma.entry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'entry-1', eventId: 'race' } }),
    );
    await downloadEntrySettlement(
      client,
      { isAuthenticated: true, type: 'jwt', userId: 7 },
      'race',
      'entry-1',
    );
    await expect(
      downloadEntrySettlement(
        client,
        { isAuthenticated: true, type: 'jwt', userId: 8 },
        'race',
        'entry-1',
      ),
    ).rejects.toThrow();
    prisma.entry.findFirst.mockResolvedValue(null);
    await expect(
      downloadEntrySettlement(client, guest, 'other-race', 'entry-1', token),
    ).rejects.toThrow('not found');
  });
});
