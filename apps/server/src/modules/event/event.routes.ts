import { createRouter } from '../../lib/create-app.js';
import { requireAuth } from '../../middlewares/require-jwt.js';

import punchRoutes from '../punch/punch.routes.js';
import entryPaymentRoutes from '../entry/entry-payment.routes.js';

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
router.route('/', punchRoutes);
router.route('/', entryPaymentRoutes);

export default router;
