import { Router } from 'express';
import { check, validationResult } from 'express-validator';

import { validation, error, success } from '../../utils/responseApi.js';
import { calculateCompetitorRankingPoints } from '../../utils/ranking.js';
import { formatErrors } from '../../utils/errors.js';
import prisma from '../../utils/context.js';

const router = Router();

/**
 * @swagger
 * /rest/v1/events:
 *  get:
 *    summary: All event in the app
 *    description: Get all available events
 *    tags:
 *       - Events
 *    responses:
 *      200:
 *        description: Array of events
 *      500:
 *        description: Internal server error
 */
router.get('/', async (req, res) => {
  // Everything went fine.
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
  } catch (err) {
    console.error(err);
    return res.status(500).json(error(`Database error` + err.message));
  } finally {
    return res
      .status(200)
      .json(success('OK', { data: dbResponse }, res.statusCode));
  }
});

/**
 * @swagger
 * /rest/v1/events/{eventId}:
 *  get:
 *    summary: Event detail
 *    description: Get detail info about the event
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event to retrieve.
 *         schema:
 *           type: string
 *    responses:
 *      200:
 *        description: Array of events
 *      422:
 *        description: Validation Error
 *      500:
 *        description: Internal server error
 */
router.get(
  '/:eventId',
  [check('eventId').not().isEmpty().isString()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validation(formatErrors(errors)));
    }
    const { eventId } = req.params;
    // Everything went fine.
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
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json(
          error(
            `Event with ID ${eventId} does not exist in the database` +
              err.message,
          ),
        );
    }

    if (!dbResponse) {
      return res
        .status(422)
        .json(
          validation(
            `Event with ID ${eventId} does not exist in the database`,
            422,
          ),
        );
    }

    return res
      .status(200)
      .json(success('OK', { data: dbResponse }, res.statusCode));
  },
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors:
 *  get:
 *    summary: Class definition with competitos (startlists & results)
 *    description: Get event class definition and competitors
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event to retrieve.
 *         schema:
 *           type: string
 *       - in: query
 *         name: class
 *         required: false
 *         description: ID of the class whose results you want to retrieve.
 *         schema:
 *           type: integer
 *       - in: query
 *         name: lastUpdate
 *         required: false
 *         description: ISO 8601 UTC datetime — return only competitors updated after this time.
 *         schema:
 *          type: string
 *          format: date-time
 *          example: "2025-04-10T00:00:00Z"
 *    responses:
 *      200:
 *        description: Event with array of classes and competitors
 *      422:
 *        description: Validation Error
 *      500:
 *        description: Internal server error
 */
router.get(
  '/:eventId/competitors',
  [
    check('eventId').not().isEmpty().isString(),
    check('class').isNumeric().optional(),
    check('lastUpdate')
      .optional()
      .isISO8601()
      .withMessage('lastUpdate must be a valid ISO 8601 datetime'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validation(formatErrors(errors)));
    }
    const { eventId } = req.params;
    const { lastUpdate } = req.query;
    const classes = req.query.class;
    // Everything went fine.
    let dbResponseEvent;
    try {
      dbResponseEvent = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          relay: true,
        },
      });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json(
          error(
            `Event with ID ${eventId} does not exist in the database` +
              err.message,
          ),
        );
    }

    if (!dbResponseEvent) {
      return res
        .status(422)
        .json(
          validation(
            `Event with ID ${eventId} does not exist in the database`,
            422,
          ),
        );
    }

    let eventData;
    if (!dbResponseEvent.relay) {
      // Return data for an individual competition
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
              where: { id: classes && parseInt(classes) },
            },
          },
        });
      } catch (err) {
        console.error(err);
        return res.status(500).json(error(`An error occurred: ` + err.message));
      }
      eventData = dbIndividualResponse;
    } else {
      // Return data for an relay competition
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
              where: { id: classes && parseInt(classes) },
            },
          },
        });
      } catch (err) {
        console.error(err);
        return res
          .status(500)
          .json(
            error(
              `Event with ID ${eventId} does not exist in the database` +
                err.message,
            ),
          );
      }
      const teamClassesResults = dbRelayResponse.classes.map((classes) => {
        //TODO: if teams is array
        const teams = classes.teams.map((team) => {
          const notAllInactiveCompetitors = !team.competitors.every(
            (competitor) => competitor.status === 'Inactive',
          );
          let status;
          if (notAllInactiveCompetitors) {
            status = team.competitors.some(
              (competitor) => competitor.status !== 'OK',
            )
              ? team.competitors.find(
                  (competitor) =>
                    competitor.status !== 'OK' ||
                    competitor.status !== 'Inactive',
                ).status
              : 'OK';
          } else {
            status = 'Inactive';
          }
          const totalTime = team.competitors.reduce(
            (accumulator, currentValue) => accumulator + currentValue.time,
            0,
          );
          const competitors = team.competitors
            .sort((a, b) => a.leg - b.leg)
            .map((competitor) => {
              return {
                ...competitor,
                bibNumber: team.bibNumber + '.' + competitor.leg,
              };
            });
          return {
            ...team,
            competitors: competitors,
            time: status === 'DidNotFinish' || status === 'OK' ? totalTime : 0,
            status: status,
          };
        });
        classes.teams = teams;
        return {
          ...classes,
          teamsCount: classes.teams.length,
        };
      });
      eventData = { ...dbRelayResponse, classes: teamClassesResults };
    }
    return res
      .status(200)
      .json(success('OK', { data: eventData }, res.statusCode));
  },
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors/{competitorId}:
 *  get:
 *    summary: Competitor detail
 *    description: Get competitor detial data
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event to retrieve.
 *         schema:
 *           type: string
 *       - in: path
 *         name: competitorId
 *         required: true
 *         description: ID of the competitor whose detail you want to get.
 *         schema:
 *            type: integer
 *    responses:
 *      200:
 *        description: Event with array of classes and competitors
 *      422:
 *        description: Validation Error
 *      500:
 *        description: Internal server error
 */
router.get(
  '/:eventId/competitors/:competitorId',
  [
    check('eventId').not().isEmpty().isString(),
    check('competitorId').not().isEmpty().isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validation(formatErrors(errors)));
    }
    const { eventId, competitorId } = req.params;
    // Everything went fine.
    let dbResponseEvent;
    try {
      dbResponseEvent = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          relay: true,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json(error(`An error occurred: ` + err.message));
    }

    if (!dbResponseEvent) {
      return res
        .status(422)
        .json(
          validation(
            `Event with ID ${eventId} does not exist in the database`,
            422,
          ),
        );
    }

    let competitorData;
    if (!dbResponseEvent.relay) {
      // Return data for an individual competition
      let dbIndividualResponse;
      try {
        dbIndividualResponse = await prisma.competitor.findFirst({
          where: {
            id: parseInt(competitorId),
            class: {
              eventId: eventId, // Ensure this matches the structure and type of your eventId
            },
          },
          select: {
            id: true,
            classId: true,
            firstname: true,
            lastname: true,
            bibNumber: true,
            nationality: true,
            registration: true,
            license: true,
            ranking: true,
            rankPointsAvg: true,
            organisation: true,
            shortName: true,
            card: true,
            startTime: true,
            finishTime: true,
            time: true,
            status: true,
            lateStart: true,
            note: true,
            externalId: true,
            updatedAt: true,
            splits: {
              select: { controlCode: true, time: true },
            },
            class: {
              select: {
                id: true,
                externalId: true,
                name: true,
                startName: true,
                length: true,
                climb: true,
                controlsCount: true,
              },
            },
          },
        });
      } catch (err) {
        console.error(err);
        return res
          .status(500)
          .json(
            error(
              `Competitor with ID ${competitorId} in the event with ID ${eventId} does not exist in the database` +
                err.message,
            ),
          );
      }
      competitorData = dbIndividualResponse;
    } else {
      // Return data for an relay competition
      let dbRelayResponse;
      try {
        dbRelayResponse = await prisma.competitor.findFirst({
          where: {
            id: parseInt(competitorId),
            class: {
              eventId: eventId, // Ensure this matches the structure and type of your eventId
            },
          },
          select: {
            id: true,
            classId: true,
            firstname: true,
            lastname: true,
            nationality: true,
            registration: true,
            license: true,
            ranking: true,
            organisation: true,
            shortName: true,
            card: true,
            startTime: true,
            finishTime: true,
            time: true,
            teamId: true,
            leg: true,
            status: true,
            note: true,
            externalId: true,
            updatedAt: true,
            splits: {
              select: { controlCode: true, time: true },
            },
            class: {
              select: {
                id: true,
                externalId: true,
                name: true,
                length: true,
                climb: true,
                controlsCount: true,
              },
            },
            team: {
              select: {
                name: true,
                organisation: true,
                shortName: true,
                bibNumber: true,
              },
            },
          },
        });
      } catch (err) {
        console.error(err);
        return res
          .status(500)
          .json(
            error(
              `Competitor with ID ${competitorId} in the event with ID ${eventId} does not exist in the database` +
                err.message,
            ),
          );
      }
      competitorData = dbRelayResponse;
    }
    return res
      .status(200)
      .json(success('OK', { data: competitorData }, res.statusCode));
  },
);

router.post('/:eventId/ranking', async (req, res) => {
  // Everything went fine.

  const { eventId } = req.params;
  calculateCompetitorRankingPoints(eventId);
  return res
    .status(200)
    .json(success('OK', { data: 'Calculate ranking' }, res.statusCode));
});

export default router;
