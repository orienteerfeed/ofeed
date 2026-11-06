import { createRouter } from "../../lib/create-app.js";

import { registerAuthRoutes } from "./auth.handlers.js";
import { registerSsoRoutes } from "./sso/sso.handlers.js";

const router = createRouter();

registerAuthRoutes(router);
registerSsoRoutes(router);

export default router;
