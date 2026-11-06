import type { EventEntryTimeline } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { AuthzError, requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';
import { formatLocalDate } from '../../utils/time.js';
import { allocateEntryReportPrices } from './entry-report-pricing.js';

/** Owner/admin-only report: includes personal entry rows and receipt-derived balances. */
export async function getEventEntryTimeline(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
): Promise<EventEntryTimeline> {
  if (!auth?.isAuthenticated || auth.type !== 'jwt') throw new AuthzError('User JWT required', 401);
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      name: true,
      location: true,
      timezone: true,
      date: true,
      entriesOpenAt: true,
      entriesCloseAt: true,
    },
  });
  const storedOrders = await prisma.entry.findMany({
    where: { eventId, items: { some: { actionKey: 'NEW_ENTRY' } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      createdAt: true,
      status: true,
      paid: true,
      paymentReference: true,
      paymentMethod: true,
      currency: true,
      totalAmount: true,
      promoCode: true,
      promoDiscountAmount: true,
      payments: { select: { amount: true, currency: true } },
      items: {
        where: { actionKey: 'NEW_ENTRY' },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          classId: true,
          class: { select: { name: true } },
          firstname: true,
          lastname: true,
          organisation: true,
          card: true,
          cardRental: true,
          fee: true,
          cardRentalFee: true,
          allowPromoCode: true,
        },
      },
    },
  });
  const timezone = formatLocalDate(event.date, event.timezone) ? event.timezone : 'UTC';
  const localDate = (instant: Date) => formatLocalDate(instant, timezone) as string;
  const days = new Map<string, EventEntryTimeline['days'][number]>();
  const orders = storedOrders.map((order) => {
    const prices = allocateEntryReportPrices(
      order.items.map((item) => ({
        fee: item.fee.toNumber(),
        cardRentalFee: item.cardRentalFee?.toNumber() ?? null,
        allowPromoCode: item.allowPromoCode,
      })),
      order.promoDiscountAmount?.toNumber() ?? 0,
    );
    const receivedCents = order.payments
      .filter((payment) => payment.currency === order.currency)
      .reduce((sum, payment) => sum + Math.round(payment.amount.toNumber() * 100), 0);
    const legacyPaid = order.payments.length === 0 && order.paid;
    const outstandingCents = legacyPaid
      ? 0
      : Math.max(0, Math.round(order.totalAmount.toNumber() * 100) - receivedCents);
    const date = localDate(order.createdAt);
    if (!['CANCELLED', 'REJECTED'].includes(order.status)) {
      for (const item of order.items) {
        const key = `${date}|${item.classId}`;
        const day = days.get(key) ?? {
          date,
          classId: item.classId,
          className: item.class.name,
          entries: 0,
          lateEntries: 0,
        };
        day.entries++;
        if (event.entriesCloseAt && order.createdAt > event.entriesCloseAt) day.lateEntries++;
        days.set(key, day);
      }
    }
    return {
      id: order.id,
      receivedAt: order.createdAt.toISOString(),
      status: order.status,
      paymentReference: order.paymentReference,
      paymentMethod: order.paymentMethod,
      currency: order.currency,
      totalAmount: order.totalAmount.toNumber(),
      receivedAmount: receivedCents / 100,
      outstandingAmount: outstandingCents / 100,
      legacyPaid,
      paid: outstandingCents === 0,
      promoCode: order.promoCode,
      promoDiscountAmount: order.promoDiscountAmount?.toNumber() ?? 0,
      items: order.items.map((item, index) => ({
        id: item.id,
        classId: item.classId,
        className: item.class.name,
        firstname: item.firstname,
        lastname: item.lastname,
        organisation: item.organisation,
        card: item.card,
        cardRental: item.cardRental,
        amount: prices[index]!,
      })),
    };
  });
  return {
    eventName: event.name,
    location: event.location,
    startAt: event.date.toISOString(),
    orders,
    timezone,
    entriesOpenOn: event.entriesOpenAt ? localDate(event.entriesOpenAt) : null,
    entriesCloseOn: event.entriesCloseAt ? localDate(event.entriesCloseAt) : null,
    eventOn: localDate(event.date),
    days: [...days.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className),
    ),
  };
}
