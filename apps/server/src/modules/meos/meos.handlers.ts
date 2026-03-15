import type { AppOpenAPI } from "../../types";
import { toLowerCaseHeaderRecord } from "../../lib/http/headers.js";
import { verifyBasicAuth } from "../../utils/jwtToken.js";
import {
  MopProcessingError,
  type MopStatusCode,
  getEventIdFromMeosCompetitionId,
  processMeosMopPayload,
} from "./meos.service.js";

function toMopStatusXml(status: MopStatusCode) {
  return `<?xml version="1.0" encoding="UTF-8"?><MOPStatus status="${status}"></MOPStatus>`;
}

function mopStatusResponse(status: MopStatusCode) {
  return new Response(toMopStatusXml(status), {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}

function parseCompetitionId(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function registerMeosRoutes(router: AppOpenAPI) {
  router.post("/mop", async c => {
    const headers = toLowerCaseHeaderRecord(c.req.raw.headers);
    const competitionId = parseCompetitionId(headers.competition);

    if (!competitionId) {
      return mopStatusResponse("BADCMP");
    }

    const eventId = await getEventIdFromMeosCompetitionId(competitionId);
    if (!eventId) {
      return mopStatusResponse("BADCMP");
    }

    const password = headers.pwd ?? "";
    try {
      await verifyBasicAuth(eventId, password);
    } catch {
      return mopStatusResponse("BADPWD");
    }

    const payload = await c.req.text();

    try {
      await processMeosMopPayload(eventId, payload);
      return mopStatusResponse("OK");
    } catch (error) {
      if (error instanceof MopProcessingError) {
        return mopStatusResponse(error.status);
      }

      const logger = c.get("logger");
      logger?.error("MeOS MOP processing failed", {
        eventId,
        competitionId,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });

      return mopStatusResponse("SERVERERR");
    }
  });
}
