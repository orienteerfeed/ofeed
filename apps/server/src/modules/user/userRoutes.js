import { Router } from 'express';

import { verifyJwtToken } from '../../utils/jwtToken.js';
import {
  error as errorResponse,
  success as successResponse,
} from '../../utils/responseApi.js';

import prisma from '../../utils/context.js';

const router = Router();

// User routes
// Verify user authentication
router.use(verifyJwtToken);
// Secure routes (behind authentication)
/**
 * @swagger
 * /rest/v1/my-events:
 *  get:
 *    summary: Events for current logged in user
 *    description: Get all available events created by the currently logged-in user
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Array of events
 *      401:
 *        description: Not authenticated
 *      500:
 *        description: Internal Server Error
 */
router.get('/', async (req, res) => {
  // Everything went fine.
  const { userId } = req.jwtDecoded;
  let dbResponse;
  try {
    dbResponse = await prisma.event.findMany({
      where: { authorId: userId },
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
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json(errorResponse(`An error occurred` + err.message));
  } finally {
    return res
      .status(200)
      .json(successResponse('OK', { data: dbResponse }, res.statusCode));
  }
});

export default router;
