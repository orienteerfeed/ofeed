import prisma from '../../utils/context.js';
import { decorateCompetitorsWithCurrentCzechRankingState } from '../../utils/czech-ranking.js';
import {
  flattenOrganisation,
  organisationSelect,
} from '../../modules/event/organisation.helpers.js';

async function getCompetitorsByClassBase(classId, includeSplits = false) {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { classId },
      include: {
        organisation: { select: organisationSelect },
        ...(includeSplits
          ? {
              splits: {
                select: {
                  controlCode: true,
                  time: true,
                },
                orderBy: { time: 'asc' },
              },
            }
          : {}),
      },
    });

    const flattened = competitors.map((c) => flattenOrganisation(c));
    return decorateCompetitorsWithCurrentCzechRankingState(classId, flattened);
  } catch (error) {
    console.error('Error fetching competitors by class:', error);
    throw new Error('Failed to fetch competitors');
  }
}

export const getCompetitorsByClass = async (classId) => getCompetitorsByClassBase(classId, false);

export const getCompetitorsWithSplitsByClass = async (classId) =>
  getCompetitorsByClassBase(classId, true);
