import { Prisma } from '../../generated/prisma/client.js';
import prisma from '../../utils/context.js';

import {
  COMPETITOR_DIFF_SELECT,
  detectCompetitorChanges,
} from '../competitor/competitor-change.helpers.js';
import { createCompetitorProtocolEntries } from '../competitor/competitor-change.service.js';
import type { MopClass, MopCompetitor, MopDocument, MopOrg, MopTeam } from './meos.parser.js';
import { mapMopStat, meosTimeToDateTime } from './meos.parser.js';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface EventRef {
  id: string;
  date: Date;
  timezone: string;
  authorId: number;
}

type OrganisationRef = {
  id: number;
  name: string | null;
  shortName: string | null;
};

type OrganisationMapValue = number | OrganisationRef;

const MEOS_COMPETITOR_SELECT = {
  ...COMPETITOR_DIFF_SELECT,
  splits: {
    select: { controlCode: true, time: true },
    orderBy: { id: 'asc' },
  },
} as const;

type MeosDbCompetitor = Prisma.CompetitorGetPayload<{ select: typeof MEOS_COMPETITOR_SELECT }>;

export type MopProcessResult = {
  updatedClassIds: number[];
  updatedCompetitorIds: number[];
};

type MeosCompetitorMutationResult = {
  updated: boolean;
  classId?: number;
  competitorId?: number;
};

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isCompletedMeosResult(stat: number): boolean {
  return stat === 1 || stat === 6 || stat === 15;
}

function deriveFinishTime(
  startTime: Date | null,
  runTimeSeconds: number | null,
  stat: number,
): Date | null | undefined {
  if (startTime === null || runTimeSeconds === null) {
    return undefined;
  }

  if (!isCompletedMeosResult(stat)) {
    return null;
  }

  return new Date(startTime.getTime() + runTimeSeconds * 1000);
}

async function findExistingMeosCompetitor(
  tx: PrismaTx,
  eventId: string,
  dbClassId: number,
  cmp: MopCompetitor,
): Promise<MeosDbCompetitor | null> {
  const externalId = String(cmp.id);
  const byExternalId = await tx.competitor.findFirst({
    where: { class: { eventId }, externalId },
    select: MEOS_COMPETITOR_SELECT,
  });
  if (byExternalId) return byExternalId;

  const firstname = normalizeText(cmp.firstname);
  const lastname = normalizeText(cmp.lastname);
  if (!firstname && !lastname) return null;

  const nameWhere = {
    firstname: cmp.firstname,
    lastname: cmp.lastname,
  };

  const sameClassByName = await tx.competitor.findFirst({
    where: { classId: dbClassId, ...nameWhere },
    select: MEOS_COMPETITOR_SELECT,
  });
  if (sameClassByName) return sameClassByName;

  return tx.competitor.findFirst({
    where: { class: { eventId }, ...nameWhere },
    select: MEOS_COMPETITOR_SELECT,
  });
}

function getOrganisationId(ref: OrganisationMapValue | undefined): number | null {
  if (ref === undefined) return null;
  return typeof ref === 'number' ? ref : ref.id;
}

function getOrganisationName(ref: OrganisationMapValue | undefined): string | null {
  return typeof ref === 'object' ? ref.name : null;
}

function getOrganisationShortName(ref: OrganisationMapValue | undefined): string | null {
  return typeof ref === 'object' ? ref.shortName : null;
}

function normalizeMopSplits(cmp: MopCompetitor): Array<{ controlCode: number; time: number }> {
  return cmp.splits.map((split) => ({
    controlCode: split.code,
    time: Math.floor(split.tenths / 10),
  }));
}

function areSplitsEqual(
  previous: Array<{ controlCode: number; time: number | null }>,
  incoming: Array<{ controlCode: number; time: number }>,
): boolean {
  if (previous.length !== incoming.length) return false;

  return previous.every((split, index) => {
    const next = incoming[index];
    return split.controlCode === next.controlCode && split.time === next.time;
  });
}

async function replaceMeosSplits(
  tx: PrismaTx,
  competitorId: number,
  splits: Array<{ controlCode: number; time: number }>,
): Promise<void> {
  await tx.split.deleteMany({ where: { competitorId } });
  for (const split of splits) {
    await tx.split.create({
      data: {
        competitorId,
        controlCode: split.controlCode,
        time: split.time,
      },
    });
  }
}

export async function resetEventData(tx: PrismaTx, eventId: string): Promise<void> {
  await tx.split.deleteMany({
    where: { competitor: { class: { eventId } } },
  });
  await tx.protocol.deleteMany({
    where: { competitor: { class: { eventId } } },
  });
  await tx.competitor.deleteMany({
    where: { class: { eventId } },
  });
  await tx.team.deleteMany({
    where: { class: { eventId } },
  });
  await tx.class.deleteMany({ where: { eventId } });
  await tx.organisation.deleteMany({ where: { eventId } });
}

export async function upsertMeosOrg(tx: PrismaTx, eventId: string, org: MopOrg): Promise<number> {
  const externalId = String(org.id);
  const name = normalizeText(org.name);
  const nationality = normalizeText(org.nationality);
  const shortName = normalizeText(org.shortName)?.slice(0, 20) ?? null;

  const byExternalId = await tx.organisation.findFirst({
    where: { eventId, externalId },
    select: { id: true },
  });
  const byName = name
    ? await tx.organisation.findUnique({
        where: { eventId_name: { eventId, name } },
        select: { id: true, externalId: true },
      })
    : null;

  if (byExternalId) {
    if (byName && byName.id !== byExternalId.id) {
      await tx.organisation.update({
        where: { id: byName.id },
        data: {
          ...(nationality ? { nationality } : {}),
          ...(shortName ? { shortName } : {}),
        },
      });
      return byName.id;
    }

    await tx.organisation.update({
      where: { id: byExternalId.id },
      data: {
        ...(name ? { name } : {}),
        ...(nationality ? { nationality } : {}),
        ...(shortName ? { shortName } : {}),
      },
    });
    return byExternalId.id;
  }

  if (byName) {
    await tx.organisation.update({
      where: { id: byName.id },
      data: {
        ...(byName.externalId ? {} : { externalId }),
        ...(nationality ? { nationality } : {}),
        ...(shortName ? { shortName } : {}),
      },
    });
    return byName.id;
  }

  const created = await tx.organisation.create({
    data: {
      eventId,
      externalId,
      name: name ?? externalId,
      nationality,
      shortName,
    },
    select: { id: true },
  });
  return created.id;
}

export async function upsertMeosClass(
  tx: PrismaTx,
  eventId: string,
  cls: MopClass,
): Promise<number> {
  const externalId = String(cls.id);
  const name = normalizeText(cls.name) ?? externalId;

  const byExternalId = await tx.class.findFirst({
    where: { eventId, externalId },
    select: { id: true },
  });
  if (byExternalId) {
    await tx.class.update({
      where: { id: byExternalId.id },
      data: { name },
    });
    return byExternalId.id;
  }

  const byName = await tx.class.findFirst({
    where: { eventId, name },
    select: { id: true, externalId: true },
  });
  if (byName) {
    await tx.class.update({
      where: { id: byName.id },
      data: byName.externalId ? { name } : { name, externalId },
    });
    return byName.id;
  }

  const created = await tx.class.create({
    data: {
      eventId,
      externalId,
      name,
    },
    select: { id: true },
  });
  return created.id;
}

export async function upsertMeosCompetitor(
  tx: PrismaTx,
  eventId: string,
  cmp: MopCompetitor,
  orgIdMap: Map<number, OrganisationMapValue>,
  classIdMap: Map<number, number>,
  event: EventRef,
): Promise<MeosCompetitorMutationResult> {
  if (cmp.classId === undefined) return { updated: false };
  const dbClassId = classIdMap.get(cmp.classId);
  if (dbClassId === undefined) return { updated: false };

  const orgRef = cmp.orgId !== undefined ? orgIdMap.get(cmp.orgId) : undefined;
  const dbOrgId = getOrganisationId(orgRef);
  const organisation = getOrganisationName(orgRef);
  const shortName = getOrganisationShortName(orgRef);
  const status = mapMopStat(cmp.stat);
  const startTime =
    cmp.startTenths !== undefined && cmp.startTenths > 0
      ? meosTimeToDateTime(cmp.startTenths, event.date, event.timezone)
      : null;
  const time =
    cmp.runTimeTenths !== undefined && cmp.runTimeTenths > 0
      ? Math.floor(cmp.runTimeTenths / 10)
      : null;
  const finishTime = deriveFinishTime(startTime, time, cmp.stat);
  const externalId = String(cmp.id);
  const createData = {
    classId: dbClassId,
    externalId,
    firstname: cmp.firstname,
    lastname: cmp.lastname,
    ...(cmp.bibNumber !== undefined ? { bibNumber: cmp.bibNumber } : {}),
    card: cmp.card ?? null,
    organisationId: dbOrgId,
    status,
    startTime,
    finishTime: finishTime ?? null,
    time,
    registration: '',
  };
  const updateData = {
    firstname: cmp.firstname,
    lastname: cmp.lastname,
    ...(cmp.bibNumber !== undefined ? { bibNumber: cmp.bibNumber } : {}),
    ...(cmp.card !== undefined ? { card: cmp.card === 0 ? null : cmp.card } : {}),
    ...(cmp.orgId !== undefined ? { organisationId: dbOrgId } : {}),
    status,
    ...(cmp.startTenths !== undefined ? { startTime } : {}),
    ...(finishTime !== undefined ? { finishTime } : {}),
    ...(cmp.runTimeTenths !== undefined ? { time } : {}),
  };
  const incomingData = {
    classId: dbClassId,
    firstname: cmp.firstname,
    lastname: cmp.lastname,
    ...(cmp.bibNumber !== undefined ? { bibNumber: cmp.bibNumber } : {}),
    ...(cmp.card !== undefined ? { card: cmp.card === 0 ? null : cmp.card } : {}),
    ...(cmp.orgId !== undefined ? { organisation, shortName } : {}),
    status,
    ...(cmp.startTenths !== undefined ? { startTime } : {}),
    ...(finishTime !== undefined ? { finishTime } : {}),
    ...(cmp.runTimeTenths !== undefined ? { time } : {}),
  };
  const incomingSplits = normalizeMopSplits(cmp);

  const existing = await findExistingMeosCompetitor(tx, eventId, dbClassId, cmp);

  if (!existing) {
    const created = await tx.competitor.create({
      data: createData,
      select: { id: true, classId: true },
    });

    await createCompetitorProtocolEntries(tx, {
      eventId,
      competitorId: created.id,
      origin: 'IT',
      authorId: event.authorId,
      changes: [
        {
          type: 'competitor_create',
          previousValue: null,
          newValue: `${cmp.lastname} ${cmp.firstname}`,
        },
      ],
    });

    if (incomingSplits.length > 0) {
      await replaceMeosSplits(tx, created.id, incomingSplits);
    }

    return { updated: true, classId: created.classId, competitorId: created.id };
  }

  const fieldChanges = detectCompetitorChanges(
    existing as unknown as Record<string, unknown>,
    incomingData,
    {
      organisation: existing.organisation?.name ?? null,
      shortName: existing.organisation?.shortName ?? null,
    },
  );
  const splitsChanged = !areSplitsEqual(existing.splits, incomingSplits);

  if (fieldChanges.length === 0 && !splitsChanged) {
    return { updated: false, classId: existing.classId, competitorId: existing.id };
  }

  if (fieldChanges.length > 0) {
    await tx.competitor.update({
      where: { id: existing.id },
      data: {
        classId: dbClassId,
        externalId,
        ...updateData,
      },
      select: { id: true },
    });

    await createCompetitorProtocolEntries(tx, {
      eventId,
      competitorId: existing.id,
      origin: 'IT',
      authorId: event.authorId,
      changes: fieldChanges,
    });
  }

  if (splitsChanged) {
    await replaceMeosSplits(tx, existing.id, incomingSplits);
  }

  return { updated: true, classId: dbClassId, competitorId: existing.id };
}

export async function upsertMeosTeam(
  tx: PrismaTx,
  eventId: string,
  tm: MopTeam,
  classIdMap: Map<number, number>,
  orgIdMap?: Map<number, OrganisationMapValue>,
): Promise<void> {
  if (tm.classId === undefined) return;
  const dbClassId = classIdMap.get(tm.classId);
  if (dbClassId === undefined) return;

  const dbOrgId =
    tm.orgId !== undefined && orgIdMap ? getOrganisationId(orgIdMap.get(tm.orgId)) : null;

  const result = await tx.team.upsert({
    where: {
      classId_externalId: {
        classId: dbClassId,
        externalId: String(tm.id),
      },
    },
    create: {
      classId: dbClassId,
      externalId: String(tm.id),
      name: tm.name,
      organisationId: dbOrgId,
      bibNumber: tm.bibNumber ?? 0,
    },
    update: {
      name: tm.name,
      organisationId: dbOrgId,
      ...(tm.bibNumber !== undefined ? { bibNumber: tm.bibNumber } : {}),
    },
    select: { id: true },
  });

  if (tm.members !== undefined) {
    await tx.competitor.updateMany({
      where: { teamId: result.id, class: { eventId } },
      data: { teamId: null, leg: null },
    });

    for (const member of tm.members) {
      await tx.competitor.updateMany({
        where: { externalId: String(member.competitorId), class: { eventId } },
        data: { teamId: result.id, leg: member.leg },
      });
    }
  }
}

export async function deleteMeosCompetitor(
  tx: PrismaTx,
  eventId: string,
  meosId: number,
): Promise<MeosCompetitorMutationResult> {
  const existing = await tx.competitor.findFirst({
    where: { externalId: String(meosId), class: { eventId } },
    select: { id: true, classId: true },
  });
  if (!existing) return { updated: false };

  await tx.split.deleteMany({ where: { competitorId: existing.id } });
  await tx.competitor.deleteMany({
    where: { externalId: String(meosId), class: { eventId } },
  });
  return { updated: true, classId: existing.classId, competitorId: existing.id };
}

export async function deleteMeosOrg(tx: PrismaTx, eventId: string, meosId: number): Promise<void> {
  await tx.organisation.deleteMany({
    where: { eventId, externalId: String(meosId) },
  });
}

export async function deleteMeosClass(
  tx: PrismaTx,
  eventId: string,
  meosId: number,
): Promise<void> {
  await tx.class.deleteMany({
    where: { eventId, externalId: String(meosId) },
  });
}

export async function deleteMeosTeam(tx: PrismaTx, eventId: string, meosId: number): Promise<void> {
  await tx.team.deleteMany({
    where: { externalId: String(meosId), class: { eventId } },
  });
}

export async function processMopDocument(
  eventId: string,
  doc: MopDocument,
  event: EventRef,
): Promise<MopProcessResult> {
  if (!Number.isInteger(event.authorId)) {
    throw new Error('MeOS import cannot write protocol records without an event author');
  }

  return prisma.$transaction(async (tx) => {
    const orgIdMap = await loadExistingOrgIdMap(tx, eventId);
    const classIdMap = await loadExistingClassIdMap(tx, eventId);
    const updatedClassIds = new Set<number>();
    const updatedCompetitorIds = new Set<number>();

    // 1. Orgs
    for (const org of doc.orgs) {
      if (org.delete) {
        await deleteMeosOrg(tx, eventId, org.id);
        orgIdMap.delete(org.id);
      } else {
        const dbId = await upsertMeosOrg(tx, eventId, org);
        orgIdMap.set(org.id, await findOrganisationRefById(tx, dbId));
      }
    }

    // 2. Classes
    for (const cls of doc.classes) {
      if (cls.delete) {
        await deleteMeosClass(tx, eventId, cls.id);
        classIdMap.delete(cls.id);
      } else {
        const dbId = await upsertMeosClass(tx, eventId, cls);
        classIdMap.set(cls.id, dbId);
      }
    }

    // 3. Competitors
    for (const cmp of doc.competitors) {
      let result: MeosCompetitorMutationResult;
      if (cmp.delete) {
        result = await deleteMeosCompetitor(tx, eventId, cmp.id);
      } else {
        result = await upsertMeosCompetitor(tx, eventId, cmp, orgIdMap, classIdMap, event);
      }

      if (result.updated) {
        if (result.classId !== undefined) updatedClassIds.add(result.classId);
        if (!cmp.delete && result.competitorId !== undefined) {
          updatedCompetitorIds.add(result.competitorId);
        }
      }
    }

    // 4. Teams
    for (const tm of doc.teams) {
      if (tm.delete) {
        await deleteMeosTeam(tx, eventId, tm.id);
      } else {
        await upsertMeosTeam(tx, eventId, tm, classIdMap, orgIdMap);
      }
    }

    return {
      updatedClassIds: [...updatedClassIds],
      updatedCompetitorIds: [...updatedCompetitorIds],
    };
  });
}

async function findOrganisationRefById(tx: PrismaTx, id: number): Promise<OrganisationRef> {
  const org = await tx.organisation.findUnique({
    where: { id },
    select: { id: true, name: true, shortName: true },
  });

  if (!org) {
    throw new Error(`Organisation ${id} was not found after upsert`);
  }

  return org;
}

async function loadExistingOrgIdMap(
  tx: PrismaTx,
  eventId: string,
): Promise<Map<number, OrganisationRef>> {
  const orgs = await tx.organisation.findMany({
    where: { eventId, externalId: { not: null } },
    select: { id: true, externalId: true, name: true, shortName: true },
  });

  return new Map(
    orgs
      .map(
        (org) =>
          [
            Number(org.externalId),
            { id: org.id, name: org.name, shortName: org.shortName },
          ] as const,
      )
      .filter(([externalId]) => Number.isInteger(externalId)),
  );
}

async function loadExistingClassIdMap(tx: PrismaTx, eventId: string): Promise<Map<number, number>> {
  const classes = await tx.class.findMany({
    where: { eventId, externalId: { not: null } },
    select: { id: true, externalId: true },
  });

  return new Map(
    classes
      .map((cls) => [Number(cls.externalId), cls.id] as const)
      .filter(([externalId]) => Number.isInteger(externalId)),
  );
}
