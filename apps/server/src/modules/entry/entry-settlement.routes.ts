import { createRouter } from '../../lib/create-app.js';
import { error } from '../../utils/responseApi.js';
import { isAuthzError } from '../../utils/authz.js';
import { ConflictError, NotFoundError } from '../../exceptions/index.js';
import { downloadEntrySettlement } from './entry-settlement.service.js';

const router = createRouter();
router.get('/:eventId/entries/:entryId/settlement.pdf', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  try {
    const result = await downloadEntrySettlement(
      c.get('prisma'),
      c.get('authContext'),
      c.req.param('eventId'),
      c.req.param('entryId'),
      c.req.query('access'),
    );
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    return c.body(new Uint8Array(result.content));
  } catch (cause) {
    if (isAuthzError(cause)) {
      const status = cause.statusCode === 404 ? 404 : cause.statusCode === 403 ? 403 : 401;
      return c.json(error(cause.message, status), status);
    }
    if (cause instanceof NotFoundError) return c.json(error(cause.message, 404), 404);
    if (cause instanceof ConflictError) return c.json(error(cause.message, 409), 409);
    throw cause;
  }
});
export default router;
