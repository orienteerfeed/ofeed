import { createRouter } from '../../lib/create-app.js';

import { registerMeosHandler } from './meos.handlers.js';

const router = createRouter();

registerMeosHandler(router);

export default router;
