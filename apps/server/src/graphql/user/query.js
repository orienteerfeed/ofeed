import prisma from '../../utils/context.js';
import { verifyToken } from '../../utils/jwtToken.js';

export const currentUser = (_, {}, context) => {
  if (!context.token) {
    throw new Error('Unauthorized: No token provided');
  }
  const jwtDecoded = verifyToken(context.token);
  if (!jwtDecoded) {
    throw new Error('Unauthorized: Invalid or expired token');
  }
  const { userId } = jwtDecoded;

  return prisma.user.findUnique({
    where: { id: userId },
  });
};

export const myEvents = (_, {}, context) => {
  if (!context.token) {
    throw new Error('Unauthorized: No token provided');
  }
  const jwtDecoded = verifyToken(context.token);
  if (!jwtDecoded) {
    throw new Error('Unauthorized: Invalid or expired token');
  }

  const { userId } = jwtDecoded;

  return prisma.event.findMany({ where: { authorId: userId } });
};
