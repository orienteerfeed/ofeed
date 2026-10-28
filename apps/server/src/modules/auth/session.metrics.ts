import { Counter, register } from 'prom-client';
export const refreshOutcomes =
  (register.getSingleMetric('auth_refresh_total') as Counter<'outcome'> | undefined) ??
  new Counter({
    name: 'auth_refresh_total',
    help: 'Device refresh outcomes',
    labelNames: ['outcome'],
  });
export const keyReloadFailures =
  (register.getSingleMetric('auth_key_reload_failures_total') as Counter | undefined) ??
  new Counter({
    name: 'auth_key_reload_failures_total',
    help: 'Invalid or unreadable access key bundles',
  });
