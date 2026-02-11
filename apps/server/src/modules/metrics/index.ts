import { createRouter } from "../../lib/create-app";

import { getMetricsHandler } from "./metrics.handlers";
import { getMetrics } from "./metrics.routes";

const router = createRouter().openapi(getMetrics, getMetricsHandler);

export default router;
export * from "./metrics.handlers.js";
export * from "./metrics.routes.js";
export * from "./metrics.openapi.js";
