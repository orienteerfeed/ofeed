import { createRouter } from '../../lib/create-app.js';

import { getMetricsHandler } from './metrics.handlers.js';
import { getMetrics } from './metrics.routes.js';

const router = createRouter().openapi(getMetrics, getMetricsHandler as never);

export default router;
export * from './metrics.handlers.js';
export * from './metrics.openapi.js';
export * from './metrics.routes.js';
