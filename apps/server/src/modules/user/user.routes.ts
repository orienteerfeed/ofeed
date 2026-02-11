import { createRouter } from "../../lib/create-app";
import { requireJwtAuth } from "../../middlewares/require-jwt";

import { getMyEventsHandler } from "./user.handlers.js";

const router = createRouter();

router.use("*", requireJwtAuth);
router.get("/", getMyEventsHandler);

export default router;
