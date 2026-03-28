import { createRouter } from '../../lib/create-app.js';

import { healthHandler, liveHandler, readyHandler } from './health.handlers.js';
import { health, live, ready } from './health.routes.js';

const router = createRouter()
  .openapi(live, liveHandler as never)
  .openapi(ready, readyHandler as never)
  .openapi(health, healthHandler as never);

export default router;
export * from './health.handlers.js';
export * from './health.openapi.js';
export * from './health.routes.js';
export * from './health.schema.js';
export * from './health.service.js';
