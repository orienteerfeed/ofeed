import { createRouter } from '../../lib/create-app.js';

import { registerMeosHandler } from './meos.handlers.js';
import { registerMeosMipHandler } from './mip.handlers.js';

const router = createRouter();

registerMeosHandler(router);
registerMeosMipHandler(router);

export default router;
