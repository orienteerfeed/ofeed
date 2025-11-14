import prisma from '../../utils/context.js';

export const getCompetitorsByClass = async (classId) => {
  try {
    return await prisma.competitor.findMany({
      where: { classId },
    });
  } catch (error) {
    console.error('Error fetching competitors by class:', error);
    throw new Error('Failed to fetch competitors');
  }
};
