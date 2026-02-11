import { z } from "@hono/zod-openapi";

import { formatErrors } from "../../utils/errors.js";
import prisma from "../../utils/context.js";
import { getPublicObject } from "../../utils/s3Storage.js";
import { error, success, validation } from "../../utils/responseApi.js";
import { calculateCompetitorRankingPoints } from "../../utils/ranking.js";

import { getEventCompetitorDetail } from "./event.service.js";

type ValidationIssue = {
  msg: string;
  param: string;
  location: "all";
};

function toValidationIssues(issues: z.ZodIssue[]): ValidationIssue[] {
  return issues.map(issue => ({
    msg: issue.message,
    param: issue.path.length > 0 ? issue.path.join(".") : "body",
    location: "all",
  }));
}

function responseValidationIssues(issues: z.ZodIssue[]) {
  return validation(toValidationIssues(issues));
}

function responseValidationString(issues: z.ZodIssue[]) {
  return validation(
    formatErrors(
      issues.map(issue => ({
        msg: issue.message,
        param: issue.path.length > 0 ? issue.path.join(".") : "body",
        location: "all",
      })),
    ),
  );
}

export function registerPublicEventRoutes(router) {
  const eventIdParamsSchema = z.object({
    eventId: z.string().min(1),
  });

  const eventCompetitorParamsSchema = z.object({
    eventId: z.string().min(1),
    competitorId: z.string().regex(/^\d+$/),
  });

  const eventCompetitorExternalParamsSchema = z.object({
    eventId: z.string().min(1),
    competitorExternalId: z.string().min(1),
  });

  const eventCompetitorsQuerySchema = z.object({
    class: z.string().regex(/^\d+$/).optional(),
    lastUpdate: z.string().datetime({ offset: true }).optional(),
  });

  router.get("/:eventId/image", async c => {
    const parsedParams = eventIdParamsSchema.safeParse(c.req.param());

    if (!parsedParams.success) {
      return c.json(responseValidationString(parsedParams.error.issues), 422);
    }

    const { eventId } = parsedParams.data;

    try {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { featuredImageKey: true, published: true },
      });

      if (!event || !event.featuredImageKey || !event.published) {
        return c.json(error("Image not found", 404), 404);
      }

      const s3Object = await getPublicObject(event.featuredImageKey);
      if (!s3Object?.Body) {
        return c.json(error("Image not found", 404), 404);
      }

      const headers = new Headers();

      if (s3Object.ContentType) {
        headers.set("Content-Type", s3Object.ContentType);
      }
      if (s3Object.ContentLength) {
        headers.set("Content-Length", String(s3Object.ContentLength));
      }
      headers.set("Cache-Control", "public, max-age=3600");

      return new Response(s3Object.Body as BodyInit, {
        status: 200,
        headers,
      });
    } catch (err) {
      console.error("Failed to stream image:", err);
      return c.json(error("Failed to load image", 500), 500);
    }
  });

  router.get("/", async c => {
    let dbResponse;
    try {
      dbResponse = await prisma.event.findMany({
        where: { published: true },
        select: {
          id: true,
          name: true,
          organizer: true,
          date: true,
          location: true,
          country: true,
          relay: true,
          published: true,
        },
      });
    } catch (err: any) {
      console.error(err);
      return c.json(error(`Database error${err.message}`, 500), 500);
    } finally {
      return c.json(success("OK", { data: dbResponse }, 200), 200);
    }
  });

  router.get("/:eventId", async c => {
    const parsedParams = eventIdParamsSchema.safeParse(c.req.param());
    if (!parsedParams.success) {
      return c.json(responseValidationIssues(parsedParams.error.issues), 422);
    }

    const { eventId } = parsedParams.data;

    let dbResponse;
    try {
      dbResponse = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          date: true,
          timezone: true,
          location: true,
          latitude: true,
          longitude: true,
          country: true,
          organizer: true,
          relay: true,
          ranking: true,
          coefRanking: true,
          sport: true,
          zeroTime: true,
          hundredthPrecision: true,
          classes: true,
        },
      });
    } catch (err: any) {
      console.error(err);
      return c.json(
        error(`Event with ID ${eventId} does not exist in the database${err.message}`, 500),
        500,
      );
    }

    if (!dbResponse) {
      return c.json(validation(`Event with ID ${eventId} does not exist in the database`, 422), 422);
    }

    return c.json(success("OK", { data: dbResponse }, 200), 200);
  });

  router.get("/:eventId/competitors", async c => {
    const parsedParams = eventIdParamsSchema.safeParse(c.req.param());
    const parsedQuery = eventCompetitorsQuerySchema.safeParse(c.req.query());

    if (!parsedParams.success || !parsedQuery.success) {
      const issues: z.ZodIssue[] = [
        ...(parsedParams.success ? [] : parsedParams.error.issues),
        ...(parsedQuery.success ? [] : parsedQuery.error.issues),
      ];
      return c.json(responseValidationIssues(issues), 422);
    }

    const { eventId } = parsedParams.data;
    const { lastUpdate } = parsedQuery.data;
    const classes = parsedQuery.data.class;

    let dbResponseEvent;
    try {
      dbResponseEvent = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          relay: true,
        },
      });
    } catch (err: any) {
      console.error(err);
      return c.json(
        error(`Event with ID ${eventId} does not exist in the database${err.message}`, 500),
        500,
      );
    }

    if (!dbResponseEvent) {
      return c.json(validation(`Event with ID ${eventId} does not exist in the database`, 422), 422);
    }

    let eventData;
    if (!dbResponseEvent.relay) {
      let dbIndividualResponse;
      try {
        dbIndividualResponse = await prisma.event.findUnique({
          where: { id: eventId },
          select: {
            name: true,
            classes: {
              select: {
                id: true,
                externalId: true,
                name: true,
                startName: true,
                length: true,
                climb: true,
                controlsCount: true,
                competitors: {
                  where: lastUpdate
                    ? {
                        updatedAt: {
                          gte: new Date(lastUpdate),
                        },
                      }
                    : undefined,
                  select: {
                    id: true,
                    lastname: true,
                    firstname: true,
                    organisation: true,
                    shortName: true,
                    registration: true,
                    bibNumber: true,
                    license: true,
                    ranking: true,
                    rankPointsAvg: true,
                    card: true,
                    startTime: true,
                    finishTime: true,
                    time: true,
                    status: true,
                    lateStart: true,
                    note: true,
                    externalId: true,
                  },
                },
              },
              where: { id: classes && parseInt(classes, 10) },
            },
          },
        });
      } catch (err: any) {
        console.error(err);
        return c.json(error(`An error occurred: ${err.message}`, 500), 500);
      }
      eventData = dbIndividualResponse;
    } else {
      let dbRelayResponse;
      try {
        dbRelayResponse = await prisma.event.findUnique({
          where: { id: eventId },
          select: {
            name: true,
            classes: {
              select: {
                id: true,
                externalId: true,
                name: true,
                startName: true,
                length: true,
                climb: true,
                controlsCount: true,
                teams: {
                  select: {
                    id: true,
                    name: true,
                    organisation: true,
                    shortName: true,
                    bibNumber: true,
                    competitors: {
                      where: lastUpdate
                        ? {
                            updatedAt: {
                              gte: new Date(lastUpdate),
                            },
                          }
                        : undefined,
                      select: {
                        id: true,
                        leg: true,
                        lastname: true,
                        firstname: true,
                        registration: true,
                        license: true,
                        card: true,
                        startTime: true,
                        finishTime: true,
                        time: true,
                        status: true,
                        lateStart: true,
                        note: true,
                        externalId: true,
                      },
                    },
                  },
                },
              },
              where: { id: classes && parseInt(classes, 10) },
            },
          },
        });
      } catch (err: any) {
        console.error(err);
        return c.json(
          error(`Event with ID ${eventId} does not exist in the database${err.message}`, 500),
          500,
        );
      }

      const teamClassesResults = (dbRelayResponse?.classes ?? []).map(classesResponse => {
        const teams = classesResponse.teams.map(team => {
          const notAllInactiveCompetitors = !team.competitors.every(
            competitor => competitor.status === "Inactive",
          );

          let status;
          if (notAllInactiveCompetitors) {
            status = team.competitors.some(competitor => competitor.status !== "OK")
              ? team.competitors.find(
                  competitor =>
                    competitor.status !== "OK" || competitor.status !== "Inactive",
                )?.status
              : "OK";
          } else {
            status = "Inactive";
          }

          const totalTime = team.competitors.reduce(
            (accumulator, currentValue) => accumulator + currentValue.time,
            0,
          );

          const competitors = team.competitors
            .sort((a, b) => a.leg - b.leg)
            .map(competitor => ({
              ...competitor,
              bibNumber: `${team.bibNumber}.${competitor.leg}`,
            }));

          return {
            ...team,
            competitors,
            time: status === "DidNotFinish" || status === "OK" ? totalTime : 0,
            status,
          };
        });

        classesResponse.teams = teams;
        return {
          ...classesResponse,
          teamsCount: classesResponse.teams.length,
        };
      });

      eventData = { ...dbRelayResponse, classes: teamClassesResults };
    }

    return c.json(success("OK", { data: eventData }, 200), 200);
  });

  router.get("/:eventId/competitors/:competitorId", async c => {
    const parsedParams = eventCompetitorParamsSchema.safeParse(c.req.param());
    if (!parsedParams.success) {
      return c.json(responseValidationIssues(parsedParams.error.issues), 422);
    }

    const { eventId, competitorId } = parsedParams.data;

    let dbResponseEvent;
    try {
      dbResponseEvent = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          relay: true,
        },
      });
    } catch (err: any) {
      console.error(err);
      return c.json(error(`An error occurred: ${err.message}`, 500), 500);
    }

    if (!dbResponseEvent) {
      return c.json(validation(`Event with ID ${eventId} does not exist in the database`, 422), 422);
    }

    const competitorData = await getEventCompetitorDetail(eventId, competitorId, dbResponseEvent);

    return c.json(success("OK", { data: competitorData }, 200), 200);
  });

  router.get("/:eventId/competitors/:competitorExternalId/external-id", async c => {
    const parsedParams = eventCompetitorExternalParamsSchema.safeParse(c.req.param());
    if (!parsedParams.success) {
      return c.json(responseValidationIssues(parsedParams.error.issues), 422);
    }

    const { eventId, competitorExternalId } = parsedParams.data;

    let dbResponseEvent;
    try {
      dbResponseEvent = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          relay: true,
        },
      });
    } catch (err: any) {
      console.error(err);
      return c.json(error(`An error occurred: ${err.message}`, 500), 500);
    }

    if (!dbResponseEvent) {
      return c.json(validation(`Event with ID ${eventId} does not exist in the database`, 422), 422);
    }

    const dbCompetitorResponse = await prisma.competitor.findFirst({
      where: {
        class: { eventId },
        externalId: competitorExternalId,
      },
      select: {
        id: true,
      },
    });

    if (!dbCompetitorResponse) {
      return c.json(error("Competitor not found", 404), 404);
    }

    const competitorData = await getEventCompetitorDetail(
      eventId,
      dbCompetitorResponse.id,
      dbResponseEvent,
    );

    return c.json(success("OK", { data: competitorData }, 200), 200);
  });

  router.post("/:eventId/ranking", async c => {
    const parsedParams = eventIdParamsSchema.safeParse(c.req.param());
    if (!parsedParams.success) {
      return c.json(responseValidationIssues(parsedParams.error.issues), 422);
    }

    const { eventId } = parsedParams.data;
    calculateCompetitorRankingPoints(eventId);

    return c.json(success("OK", { data: "Calculate ranking" }, 200), 200);
  });
}

