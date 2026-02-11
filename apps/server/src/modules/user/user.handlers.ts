import type { Context } from "hono";

import type { AppBindings } from "../../types";

import { getJwtUserId } from "../../middlewares/require-jwt";
import { error as errorResponse, success as successResponse } from "../../utils/responseApi.js";

import { listMyEvents } from "./user.service.js";

export async function getMyEventsHandler(c: Context<AppBindings>) {
  const userId = getJwtUserId(c);

  if (!userId) {
    return c.json(errorResponse("Not authenticated", 401), 401);
  }

  try {
    const events = await listMyEvents(userId);
    return c.json(successResponse("OK", { data: events }, 200), 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An error occurred";
    return c.json(errorResponse(message, 500), 500);
  }
}
