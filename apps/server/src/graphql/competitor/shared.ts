import prisma from '../../utils/context.js';
import { decorateCompetitorsWithCurrentCzechRankingState } from '../../utils/czech-ranking.js';

export const getCompetitorsByClass = async (classId) => {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { classId },
    });

    return decorateCompetitorsWithCurrentCzechRankingState(classId, competitors);
  } catch (error) {
    console.error('Error fetching competitors by class:', error);
    throw new Error('Failed to fetch competitors');
  }
};
