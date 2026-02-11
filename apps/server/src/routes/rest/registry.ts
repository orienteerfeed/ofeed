import authRouter from "../../modules/auth/index.js";
import eventRouter from "../../modules/event/index.js";
import uploadRouter from "../../modules/upload/index.js";
import userRouter from "../../modules/user/index.js";

import { REST_ROUTE_PATHS } from "./paths.js";

export const REST_ROUTE_REGISTRY = [
  { path: REST_ROUTE_PATHS.auth, router: authRouter },
  { path: REST_ROUTE_PATHS.events, router: eventRouter },
  { path: REST_ROUTE_PATHS.upload, router: uploadRouter },
  { path: REST_ROUTE_PATHS.myEvents, router: userRouter },
] as const;
