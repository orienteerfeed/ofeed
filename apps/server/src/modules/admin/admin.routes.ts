import { createRouter } from '../../lib/create-app.js';
import { requireAdminAccess } from '../../middlewares/require-admin.js';

import {
  clearAdminCzechRankingEventResultsHandler,
  clearAdminCzechRankingSnapshotsHandler,
  deleteAdminUserHandler,
  getAdminCzechRankingEventDetailHandler,
  getAdminCzechRankingOverviewHandler,
  getAdminCzechRankingSnapshotDetailHandler,
  getAdminDashboardHandler,
  getAdminEventsHandler,
  getAdminUsersHandler,
  syncAdminCzechRankingEventResultsHandler,
  updateAdminUserHandler,
  uploadAdminCzechRankingSnapshotHandler,
} from './admin.handlers.js';

const router = createRouter();

router.use('*', requireAdminAccess);

router.get('/dashboard', getAdminDashboardHandler);
router.get('/users', getAdminUsersHandler);
router.patch('/users/:userId', updateAdminUserHandler);
router.delete('/users/:userId', deleteAdminUserHandler);
router.get('/events', getAdminEventsHandler);
router.get('/ranking/czech', getAdminCzechRankingOverviewHandler);
router.get('/ranking/czech/snapshots', getAdminCzechRankingSnapshotDetailHandler);
router.post('/ranking/czech/snapshots', uploadAdminCzechRankingSnapshotHandler);
router.delete('/ranking/czech/snapshots', clearAdminCzechRankingSnapshotsHandler);
router.get('/ranking/czech/event-results', getAdminCzechRankingEventDetailHandler);
router.post('/ranking/czech/oris-sync', syncAdminCzechRankingEventResultsHandler);
router.delete('/ranking/czech/event-results', clearAdminCzechRankingEventResultsHandler);

export default router;
