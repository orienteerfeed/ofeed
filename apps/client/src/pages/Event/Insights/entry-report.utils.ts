import { addDays, type EntryTimelinePoint } from './entry-timeline.utils';
import { fromZonedTime } from 'date-fns-tz';
import type { EntryReportOrder, EventEntryTimeline } from '@repo/shared';
import { paymentLocalDate } from './payment-insight.utils';

export function buildEntryReport(
  timeline: EventEntryTimeline,
  classId: string,
  today: string,
  financialsForAllClasses = false
) {
  const until = timeline.eventOn < today ? timeline.eventOn : today;
  const matchesClass = (order: EntryReportOrder) =>
    !classId || order.items.some(item => String(item.classId) === classId);
  const inPeriod = (order: EntryReportOrder) =>
    paymentLocalDate(order.receivedAt, timeline.timezone) <= until;
  const excluded = (order: EntryReportOrder) =>
    ['CANCELLED', 'REJECTED'].includes(order.status);
  const allOrders = timeline.orders ?? [];
  const orders = allOrders.filter(
    order => inPeriod(order) && matchesClass(order) && !excluded(order)
  );
  const cancelled = allOrders.filter(
    order => inPeriod(order) && matchesClass(order) && excluded(order)
  ).length;
  const hiddenEntries = allOrders
    .filter(
      order =>
        !excluded(order) &&
        matchesClass(order) &&
        paymentLocalDate(order.receivedAt, timeline.timezone) > until &&
        paymentLocalDate(order.receivedAt, timeline.timezone) <= today
    )
    .reduce(
      (sum, order) =>
        sum +
        order.items.filter(item => !classId || String(item.classId) === classId)
          .length,
      0
    );
  const rows = orders.flatMap(order =>
    order.items
      .filter(item => !classId || String(item.classId) === classId)
      .map(item => ({ ...item, order }))
  );
  rows.sort(
    (a, b) =>
      a.order.receivedAt.localeCompare(b.order.receivedAt) ||
      a.order.id.localeCompare(b.order.id) ||
      a.id - b.id
  );
  const financeOrders = financialsForAllClasses
    ? allOrders.filter(order => inPeriod(order) && !excluded(order))
    : orders;
  const currencies = new Map<
    string,
    {
      currency: string;
      total: number;
      received: number;
      outstanding: number;
      legacyPaid: number;
      paidOrders: number;
      unpaidOrders: number;
    }
  >();
  const methods = new Map<
    string,
    { method: string; orders: number; amounts: Map<string, number> }
  >();
  for (const order of financeOrders) {
    const current = currencies.get(order.currency) ?? {
      currency: order.currency,
      total: 0,
      received: 0,
      outstanding: 0,
      legacyPaid: 0,
      paidOrders: 0,
      unpaidOrders: 0,
    };
    current.total += Math.round(order.totalAmount * 100);
    current.received += Math.round(order.receivedAmount * 100);
    current.outstanding += Math.round(order.outstandingAmount * 100);
    if (order.legacyPaid)
      current.legacyPaid += Math.round(order.totalAmount * 100);
    if (order.paid) current.paidOrders++;
    else current.unpaidOrders++;
    currencies.set(order.currency, current);
    const key = order.paymentMethod ?? 'UNKNOWN';
    const method = methods.get(key) ?? {
      method: key,
      orders: 0,
      amounts: new Map<string, number>(),
    };
    method.orders++;
    method.amounts.set(
      order.currency,
      (method.amounts.get(order.currency) ?? 0) +
        Math.round(order.totalAmount * 100)
    );
    methods.set(key, method);
  }
  const days = new Map<
    string,
    { date: string; entries: number; orderIds: Set<string> }
  >();
  const categories = new Map<
    number,
    { classId: number; name: string; entries: number; orderIds: Set<string> }
  >();
  for (const row of rows) {
    const date = paymentLocalDate(row.order.receivedAt, timeline.timezone);
    const day = days.get(date) ?? {
      date,
      entries: 0,
      orderIds: new Set<string>(),
    };
    day.entries++;
    day.orderIds.add(row.order.id);
    days.set(date, day);
    const category = categories.get(row.classId) ?? {
      classId: row.classId,
      name: row.className,
      entries: 0,
      orderIds: new Set<string>(),
    };
    category.entries++;
    category.orderIds.add(row.order.id);
    categories.set(row.classId, category);
  }
  const raceRows = rows.filter(
    row =>
      paymentLocalDate(row.order.receivedAt, timeline.timezone) ===
      timeline.eventOn
  );
  const raceTimes = new Map<number, number>();
  for (const row of raceRows) {
    const time = Date.parse(row.order.receivedAt);
    raceTimes.set(time, (raceTimes.get(time) ?? 0) + 1);
  }
  let total = 0;
  const raceDay = [...raceTimes]
    .sort(([a], [b]) => a - b)
    .map(([time, entries]) => ({ time, total: (total += entries) }));
  if (raceDay.length)
    raceDay.unshift({
      time: fromZonedTime(
        `${timeline.eventOn}T00:00:00`,
        timeline.timezone
      ).getTime(),
      total: 0,
    });
  return {
    rows,
    orders: orders.length,
    cancelled,
    hiddenEntries,
    currencies: [...currencies.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency)
    ),
    methods: [...methods.values()].map(method => ({
      ...method,
      amounts: [...method.amounts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => ({ currency, amount })),
    })),
    days: [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ date, entries, orderIds }) => ({
        date,
        entries,
        orders: orderIds.size,
      })),
    categories: [...categories.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ classId, name, entries, orderIds }) => ({
        classId,
        name,
        entries,
        orders: orderIds.size,
      })),
    raceDay,
  };
}
export type EntryReport = ReturnType<typeof buildEntryReport>;

/** Actual receipt instants keep before/after-start entries distinct within one day. */
export function buildEntryCumulativeCurve(
  report: Pick<EntryReport, 'rows'> | undefined,
  points: EntryTimelinePoint[],
  timezone: string,
  now: number
): (EntryTimelinePoint & { time: number })[] {
  if (!points.length) return [];
  const midnight = (date: string) =>
    fromZonedTime(`${date}T00:00:00`, timezone).getTime();
  if (!report)
    return points.map(point => ({ ...point, time: midnight(point.date) }));
  const perInstant = new Map<number, number>();
  for (const row of report.rows) {
    const time = Date.parse(row.order.receivedAt);
    perInstant.set(time, (perInstant.get(time) ?? 0) + 1);
  }
  let total = 0;
  const origin = points[0]!.date;
  const curve = [
    {
      date: origin,
      time: midnight(origin),
      entries: 0,
      lateEntries: 0,
      total: 0,
    },
  ];
  for (const [time, entries] of [...perInstant].sort(([a], [b]) => a - b)) {
    curve.push({
      time,
      date: paymentLocalDate(new Date(time).toISOString(), timezone),
      entries,
      lateEntries: 0,
      total: (total += entries),
    });
  }
  const end = Math.max(
    curve.at(-1)!.time,
    Math.min(now, midnight(addDays(points.at(-1)!.date, 1)) - 1)
  );
  if (end > curve.at(-1)!.time)
    curve.push({
      time: end,
      date: points.at(-1)!.date,
      entries: 0,
      lateEntries: 0,
      total,
    });
  return curve;
}
