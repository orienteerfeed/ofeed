import type { EventDiscipline } from '../generated/prisma/client.js';

export const isRelayDiscipline = (discipline: EventDiscipline | string | null | undefined): boolean =>
  discipline === 'RELAY' || discipline === 'SPRINT_RELAY';
