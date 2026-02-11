import { createRouter } from "../../lib/create-app";

import { registerAuthRoutes } from "./auth.handlers.js";

const router = createRouter();

registerAuthRoutes(router);

export default router;
