import { createRouter } from "../../lib/create-app.js";
import { requireJwtAuth } from "../../middlewares/require-jwt.js";

import { getMyEventsHandler } from "./user.handlers.js";

const router = createRouter();

router.use("*", requireJwtAuth);
router.get("/", getMyEventsHandler);

export default router;
