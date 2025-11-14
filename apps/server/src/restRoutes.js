import { Router } from 'express';
import authRoutes from './modules/auth/authRoutes.js';
import uploadRoutes from './modules/upload/uploadRoutes.js';
import eventRoutes from './modules/event/eventRoutes.js';
import userRoutes from './modules/user/userRoutes.js';

const router = Router();

// API ENDPOINTS

// unsecured routes for login, registration, etc.
router.use('/rest/v1/auth', authRoutes);
// Link all modules here
router.use('/rest/v1/events', eventRoutes);
router.use('/rest/v1/upload', uploadRoutes);
router.use('/rest/v1/my-events', userRoutes);

export default router;
