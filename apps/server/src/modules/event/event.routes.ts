import { createRouter } from '../../lib/create-app';
import { requireAuth } from '../../middlewares/require-jwt';

import publicEventRoutes from './event.public.routes.js';
import secureEventRoutes from './event.secure.routes.js';

const router = createRouter();

// Event routes
// Unsecure public routes
router.route('/', publicEventRoutes);

// Verify user authentication
router.use('*', requireAuth);
// Secure routes (behind authentication)
router.route('/', secureEventRoutes);

export default router;
