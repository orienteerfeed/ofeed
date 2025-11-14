import {
  DatabaseError,
  NotFoundError,
  ValidationError,
} from '../exceptions/index.js';
import prisma from './context.js';

const CZ_INDIVIDUAL_START = 0.0;
const CZ_MASS_START = 0.15;
const CZ_PURSUIT_START = 0.08;
const CZ_PREFIX_RANKING_CLASSES_REGEX = /^(H20|H21|D20|D21|M21|W21)/;
const CZ_REGISTRATION_REGEX = /^[A-Z]{3}\d{4}$/; // Regular expression to match czech registration format
const CZ_RANKING_RACES_COUNT = 8;
const EXCLUDED_COMPETITOR_STATUSES_FROM_RANKING = [
  'NotCompeting',
  'DidNotStart',
  'DidNotEnter',
  'Cancelled',
]; // List of statuses to exclude

export const calculateCompetitorRankingPoints = async (eventId) => {
  let dbEventResponse;
  try {
    dbEventResponse = await prisma.event.findUnique({
      where: {
        id: eventId,
      },
      select: {
        countryId: true,
        ranking: true,
        coefRanking: true,
        startMode: true,
        relay: true,
        classes: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
    throw new DatabaseError(`An error occurred: ` + err.message);
  }

  if (!dbEventResponse) {
    throw new NotFoundError(
      `An error occurred: Event with ID ${eventId} was not found in the database.`,
    );
  }

  if (!dbEventResponse.ranking && !dbEventResponse.relay) {
    throw new ValidationError(
      `Event with ID ${eventId} is not marked as ranking event.`,
    );
  }

  if (dbEventResponse.countryId === 'CZ') {
    const eventCoefRanking = parseFloat(dbEventResponse.coefRanking) || 1.0;
    const rankingClasses = filterCzechRankingClasses(dbEventResponse.classes);
    if (!rankingClasses) {
      throw new ValidationError(
        `No ranking classes found in the event with ID ${eventId}.`,
      );
    }

    let startCoef;

    switch (dbEventResponse.startMode.toUpperCase()) {
      case 'INDIVIDUAL':
        startCoef = CZ_INDIVIDUAL_START;
        break;
      case 'MASS':
        startCoef = CZ_MASS_START;
        break;
      case 'PURSUIT':
        startCoef = CZ_PURSUIT_START;
        break;
      default:
        startCoef = 0; // Default case if start_mode is not recognized
        break;
    }

    const czechRankingData = await prisma.rankingCzech.findMany({
      select: {
        registration: true,
        points: true,
      },
    });

    //čas závodníka - competitor time
    //střední čas určený z časů 3 nejlepších závodníků zařazených do Rankingu - kde stav je OK a registrační číslo je ve formátu XXXYYYY a čas není null
    //průměrná hodnota 5 nejvyšších rankingových čísel závodníků - list registraček kde stav není NotCompeting, DidNotStart, DidNotEnter, Cancelled
    // umístění závodníka
    //počet hodnocených závodníků v konečných výsledcích

    for (const rankingClass of rankingClasses) {
      //TODO: ensure that competitor's status wasn't changed to NotCompeting meanwhile
      const dbCompetitorsResponse = await prisma.competitor.findMany({
        where: {
          classId: rankingClass.id,
          status: {
            notIn: EXCLUDED_COMPETITOR_STATUSES_FROM_RANKING,
          },
        },
        select: {
          id: true,
          classId: true,
          registration: true,
          time: true,
          status: true,
          ranking: true,
        },
      });

      const medianTimeOfTopThree = calculateMedianOfTopThreeTimes(
        dbCompetitorsResponse,
      );
      if (medianTimeOfTopThree === null) continue; // Skip if no median time

      const top5RankingIndexes = await fetchTopRankings(
        dbEventResponse.countryId,
        dbCompetitorsResponse,
      );
      if (top5RankingIndexes === null) continue; // Skip if no top rankings

      // Filter competitors based on criteria
      const ratedCompetitors = calculateCompetitorPositionBasedOnTime(
        dbCompetitorsResponse,
      );
      // Count of rated competitors
      const totalNumberOfRatedCompetitors = ratedCompetitors.length;
      if (totalNumberOfRatedCompetitors < 0) continue; // Skip if no competitor in finish yet
      // Calcultate ranking points for each competitor
      for (const competitor of dbCompetitorsResponse) {
        let competitorRankingPoints = null;
        const competitorResult = ratedCompetitors.find(
          (ratedCompetitor) => ratedCompetitor.id === competitor.id,
        );
        if (competitorResult) {
          competitorRankingPoints =
            (2 - competitorResult.time / medianTimeOfTopThree) *
            top5RankingIndexes *
            (1 -
              (startCoef * (competitorResult.position - 1)) /
                (totalNumberOfRatedCompetitors - 1)) *
            eventCoefRanking;
          competitorRankingPoints =
            competitorRankingPoints > 0
              ? Math.round(competitorRankingPoints)
              : 0;
        }
        const rankingRecord = czechRankingData.find(
          (record) => record.registration === competitor.registration,
        );
        const averageRankingPoints = rankingRecord
          ? Math.round(rankingRecord.points / CZ_RANKING_RACES_COUNT)
          : null;
        try {
          await prisma.competitor.update({
            where: { id: competitor.id },
            data: {
              ranking: competitorRankingPoints,
              rankPointsAvg: averageRankingPoints,
            },
          });
        } catch (err) {
          console.error('An error occurred: ' + err.message);
        }
      }
    }
  }
  return true;
};

const filterCzechRankingClasses = (classes) => {
  return classes.filter((cls) =>
    CZ_PREFIX_RANKING_CLASSES_REGEX.test(cls.name),
  );
};

const calculateMedianOfTopThreeTimes = (data) => {
  // Filter out null times, sort times in ascending order, and slice the top three
  const topThreeTimes = data
    .filter(
      (entry) =>
        entry.time !== null &&
        entry.status === 'OK' &&
        CZ_REGISTRATION_REGEX.test(entry.registration.toUpperCase()),
    )
    .map((entry) => entry.time)
    .sort((a, b) => a - b)
    .slice(0, 3);

  // If there are fewer than three times, the median can't be calculated properly
  if (topThreeTimes.length < 3) return null;

  // Median of three items is always the middle one
  return topThreeTimes[1];
};

const fetchTopRankings = async (country, data) => {
  if (country === 'CZ') {
    const validRegistrations = data
      .filter((entry) => CZ_REGISTRATION_REGEX.test(entry.registration))
      .map((entry) => entry.registration);
    try {
      const topRankings = await prisma.rankingCzech.findMany({
        where: {
          registration: {
            in: validRegistrations,
          },
        },
        orderBy: [
          {
            rankIndex: 'desc',
          },
        ],
        select: {
          rankIndex: true,
          lastName: true,
        },
        take: 5,
      });

      if (topRankings.length < 5) {
        return null;
      }

      const averageRanking =
        topRankings.reduce((acc, curr) => acc + curr.rankIndex, 0) /
        topRankings.length;
      return averageRanking;
    } catch (error) {
      console.error('Error fetching rankings:', error);
    }
  }
  return null;
};

const calculateCompetitorPositionBasedOnTime = (competitors) => {
  // Filter out participants who did not finish (time is null)
  const ratedCompetitors = competitors
    .filter(
      (competitor) => competitor.time !== null && competitor.status === 'OK',
    )
    .sort((a, b) => a.time - b.time)
    .map((competitor, index) => ({
      ...competitor,
      position: index + 1,
    }));
  return ratedCompetitors;
};
