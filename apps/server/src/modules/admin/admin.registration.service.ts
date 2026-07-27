import {
  adminClubListSchema,
  adminRegistrationListSchema,
  adminRegistrationSyncStatusSchema,
  adminRegistrationSyncTriggerResultSchema,
  type AdminRegistrationSyncTriggerInput,
} from '@repo/shared';

import {
  getClubSyncState,
  getRegistrationSyncStates,
  listClubsPaged,
  listRegistrationsPaged,
  runClubSync,
  runRegistrationSync,
} from '../registration/registration.service.js';

/** Sync status + history for both the registration and club caches, for the admin overview. */
export async function getAdminRegistrationSyncStatus() {
  const [registrations, clubs] = await Promise.all([
    getRegistrationSyncStates(),
    getClubSyncState(),
  ]);

  return adminRegistrationSyncStatusSchema.parse({ registrations, clubs });
}

export async function getAdminRegistrations(params: { page: number; limit: number; q?: string }) {
  const result = await listRegistrationsPaged(params);
  return adminRegistrationListSchema.parse(result);
}

export async function getAdminClubs(params: { page: number; limit: number; q?: string }) {
  const result = await listClubsPaged(params);
  return adminClubListSchema.parse(result);
}

/**
 * Force a registration/club sync regardless of the lazy TTL — mirrors
 * `syncAdminCzechRankingEventResults`, which also calls the raw sync
 * directly instead of the lazy `ensure...` gate. Errors propagate to the
 * caller (handler returns 500), the same as the Czech ranking sync trigger;
 * the persisted sync-state row still records the failure for the overview.
 */
export async function triggerAdminRegistrationSync(input: AdminRegistrationSyncTriggerInput) {
  const startedAt = new Date();
  const year = input.year ?? startedAt.getFullYear();

  let registrationsSynced: number | null = null;
  let clubsSynced: number | null = null;

  if (input.scope === 'CLUBS' || input.scope === 'ALL') {
    clubsSynced = await runClubSync();
  }
  if (input.scope === 'REGISTRATIONS' || input.scope === 'ALL') {
    registrationsSynced = await runRegistrationSync({ sport: input.sport, year });
  }

  return adminRegistrationSyncTriggerResultSchema.parse({
    scope: input.scope,
    sport: input.sport,
    year,
    registrationsSynced,
    clubsSynced,
    startedAt,
    finishedAt: new Date(),
  });
}
