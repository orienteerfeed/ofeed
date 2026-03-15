import { createRouter } from "../../lib/create-app";
import { registerMeosRoutes } from "./meos.handlers.js";

const router = createRouter();

registerMeosRoutes(router);

export default router;
