import { createRouter } from '../../lib/create-app.js';
import { requireAdminAccess } from '../../middlewares/require-admin.js';

import {
  createAdminSystemMessageHandler,
  clearAdminCzechRankingEventResultsHandler,
  clearAdminCzechRankingSnapshotsHandler,
  deleteAdminSystemMessageHandler,
  deleteAdminUserHandler,
  getAdminCzechRankingEventDetailHandler,
  getAdminCzechRankingOverviewHandler,
  getAdminCzechRankingSnapshotDetailHandler,
  getAdminDashboardHandler,
  getAdminClubsHandler,
  getAdminEventsHandler,
  getAdminRegistrationSyncStatusHandler,
  getAdminRegistrationsHandler,
  getAdminSystemMessagesHandler,
  getAdminUsersHandler,
  requestAdminUserEmailVerificationHandler,
  syncAdminCzechRankingEventResultsHandler,
  triggerAdminRegistrationSyncHandler,
  updateAdminSystemMessageHandler,
  updateAdminUserHandler,
  uploadAdminCzechRankingSnapshotHandler,
} from './admin.handlers.js';

const router = createRouter();

router.use('*', requireAdminAccess);

router.get('/dashboard', getAdminDashboardHandler);
router.get('/users', getAdminUsersHandler);
router.patch('/users/:userId', updateAdminUserHandler);
router.delete('/users/:userId', deleteAdminUserHandler);
router.post('/users/:userId/request-email-verification', requestAdminUserEmailVerificationHandler);
router.get('/events', getAdminEventsHandler);
router.get('/system-messages', getAdminSystemMessagesHandler);
router.post('/system-messages', createAdminSystemMessageHandler);
router.patch('/system-messages/:messageId', updateAdminSystemMessageHandler);
router.delete('/system-messages/:messageId', deleteAdminSystemMessageHandler);
router.get('/ranking/czech', getAdminCzechRankingOverviewHandler);
router.get('/ranking/czech/snapshots', getAdminCzechRankingSnapshotDetailHandler);
router.post('/ranking/czech/snapshots', uploadAdminCzechRankingSnapshotHandler);
router.delete('/ranking/czech/snapshots', clearAdminCzechRankingSnapshotsHandler);
router.get('/ranking/czech/event-results', getAdminCzechRankingEventDetailHandler);
router.post('/ranking/czech/oris-sync', syncAdminCzechRankingEventResultsHandler);
router.delete('/ranking/czech/event-results', clearAdminCzechRankingEventResultsHandler);
router.get('/registrations/sync-status', getAdminRegistrationSyncStatusHandler);
router.get('/registrations', getAdminRegistrationsHandler);
router.get('/registrations/clubs', getAdminClubsHandler);
router.post('/registrations/oris-sync', triggerAdminRegistrationSyncHandler);

export default router;
