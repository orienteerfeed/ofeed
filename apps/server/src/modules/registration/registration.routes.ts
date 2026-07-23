import { createRouter } from '../../lib/create-app.js';

import { registerRegistrationRoutes } from './registration.handlers.js';

const router = createRouter();

registerRegistrationRoutes(router);

export default router;
