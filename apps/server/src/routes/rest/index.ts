import { createRouter } from "../../lib/create-app";

import { REST_ROUTE_REGISTRY } from "./registry.js";

const restRouter = createRouter();

for (const { path, router } of REST_ROUTE_REGISTRY) {
  restRouter.route(path, router as any);
}

export default restRouter;
