import type { Context } from "hono";

import type { AppBindings } from "../../types";

import { getErrorDetails, logEndpoint } from "../../lib/http/endpoint-logger.js";
import { getJwtNumericUserId } from "../../middlewares/require-jwt";
import { error as errorResponse, success as successResponse } from "../../utils/responseApi.js";

import { listMyEvents } from "./user.service.js";

export async function getMyEventsHandler(c: Context<AppBindings>) {
  const userId = getJwtNumericUserId(c) as number;

  try {
    const events = await listMyEvents(userId);
    logEndpoint(c, "info", "User events fetched", { eventsCount: events.length });
    return c.json(successResponse("OK", { data: events }, 200), 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An error occurred";
    logEndpoint(c, "error", "User events fetch failed", getErrorDetails(err));
    return c.json(errorResponse(message, 500), 500);
  }
}
