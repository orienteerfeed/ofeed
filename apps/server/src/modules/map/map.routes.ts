import { createRouter } from '../../lib/create-app.js';

import { createMapTileSessionHandler, getMapTileHandler } from './map.handlers.js';

const router = createRouter();

router.post('/tiles/session', createMapTileSessionHandler);
router.get('/tiles/raster/:mapset/:tileSize/:z/:x/:y', getMapTileHandler);

export default router;
