import prisma from "../../utils/context.js";

export async function listMyEvents(userId: number | string) {
  return prisma.event.findMany({
    where: { authorId: userId as number },
    select: {
      id: true,
      name: true,
      organizer: true,
      date: true,
      location: true,
      relay: true,
      published: true,
    },
  });
}
