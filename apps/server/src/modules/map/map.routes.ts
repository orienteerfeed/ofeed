import { createRouter } from "../../lib/create-app.js";

import { getMapTileHandler } from "./map.handlers.js";

const router = createRouter();

router.get("/tiles/raster/:mapset/:tileSize/:z/:x/:y", getMapTileHandler);

export default router;
