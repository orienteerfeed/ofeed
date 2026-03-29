import { createRouter } from "../../lib/create-app.js";

import { registerAuthRoutes } from "./auth.handlers.js";

const router = createRouter();

registerAuthRoutes(router);

export default router;
