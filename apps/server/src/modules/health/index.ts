import { createRouter } from '../../lib/create-app.js';

import { healthzHandler, readyzHandler } from './health.handlers.js';
import { healthz, readyz } from './health.routes.js';

const router = createRouter()
  .openapi(healthz, healthzHandler as never)
  .openapi(readyz, readyzHandler as never);

export default router;
export * from './health.handlers.js';
export * from './health.openapi.js';
export * from './health.routes.js';
export * from './health.schema.js';
export * from './health.service.js';
