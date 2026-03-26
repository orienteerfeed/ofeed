import { createRouter } from "../../lib/create-app";

import { getMapTileHandler } from "./map.handlers.js";

const router = createRouter();

router.get("/tiles/:z/:x/:y", getMapTileHandler);

export default router;
