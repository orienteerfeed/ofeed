import prisma from '../../utils/context.js';
import { decorateCompetitorsWithCurrentCzechRankingState } from '../../utils/czech-ranking.js';

async function getCompetitorsByClassBase(classId, includeSplits = false) {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { classId },
      ...(includeSplits
        ? {
            include: {
              splits: {
                select: {
                  controlCode: true,
                  time: true,
                },
                orderBy: { time: 'asc' },
              },
            },
          }
        : {}),
    });

    return decorateCompetitorsWithCurrentCzechRankingState(classId, competitors);
  } catch (error) {
    console.error('Error fetching competitors by class:', error);
    throw new Error('Failed to fetch competitors');
  }
}

export const getCompetitorsByClass = async (classId) => getCompetitorsByClassBase(classId, false);

export const getCompetitorsWithSplitsByClass = async (classId) =>
  getCompetitorsByClassBase(classId, true);
