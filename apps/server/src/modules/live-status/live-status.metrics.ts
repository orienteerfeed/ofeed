import { Counter, Gauge, register } from 'prom-client';
export const heartbeats =
  (register.getSingleMetric('live_status_heartbeats_total') as Counter<'outcome'> | undefined) ??
  new Counter({
    name: 'live_status_heartbeats_total',
    help: 'Durable telemetry outcomes',
    labelNames: ['outcome'],
  });
export const redisErrors =
  (register.getSingleMetric('live_status_redis_errors_total') as Counter | undefined) ??
  new Counter({
    name: 'live_status_redis_errors_total',
    help: 'Redis notification connection errors',
  });
export const activeYaroc =
  (register.getSingleMetric('live_status_active_yaroc_sessions') as Gauge | undefined) ??
  new Gauge({
    name: 'live_status_active_yaroc_sessions',
    help: 'YAROC clients owned by this process',
  });
