import { Router } from 'express';
import { verifyJwtToken } from '../../utils/jwtToken.js';

import publicEventRoutes from './publicEventRoutes.js';
import secureEventRoutes from './secureEventRoutes.js';

const router = Router();

// Event routes
// Unsecure public routes
router.use('/', publicEventRoutes);

// Verify user authentication
router.use(verifyJwtToken);
// Secure routes (behind authentication)
router.use('/', secureEventRoutes);

export default router;
