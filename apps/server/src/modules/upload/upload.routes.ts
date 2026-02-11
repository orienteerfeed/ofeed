import { createRouter } from '../../lib/create-app';

import { registerUploadRoutes } from './upload.handlers.js';

const router = createRouter();

registerUploadRoutes(router);

export default router;
