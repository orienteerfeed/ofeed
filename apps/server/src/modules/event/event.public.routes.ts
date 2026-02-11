import { createRouter } from '../../lib/create-app';

import { registerPublicEventRoutes } from './event.public.handlers.js';

const router = createRouter();

registerPublicEventRoutes(router);

export default router;
