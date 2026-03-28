import { createRouter } from '../../lib/create-app.js';

import { registerSecureEventRoutes } from './event.secure.handlers.js';

const router = createRouter();

registerSecureEventRoutes(router);

export default router;
