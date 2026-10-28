import { createRouter } from '../../lib/create-app.js';
import { getJwtNumericUserId, requireJwtAuth } from '../../middlewares/require-jwt.js';
import { error, success, validation } from '../../utils/responseApi.js';
import { notificationSettingsSchema, registerPushTokenSchema } from './devices.schema.js';
import {
  getNotificationSettings,
  registerPushToken,
  unregisterPushToken,
  updateNotificationSettings,
} from './devices.service.js';

const router = createRouter();
router.use('*', requireJwtAuth);

router.post('/push-tokens', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(error('Invalid JSON body', 400), 400);
  }
  const parsed = registerPushTokenSchema.safeParse(body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  const data = await registerPushToken(
    c.get('prisma'),
    getJwtNumericUserId(c) as number,
    parsed.data,
  );
  return c.json(success('Push token registered', { data }), 200);
});

router.delete('/push-tokens/:deviceId', async (c) => {
  const data = await unregisterPushToken(
    c.get('prisma'),
    getJwtNumericUserId(c) as number,
    c.req.param('deviceId'),
  );
  return c.json(success('Push token removed', { data }), 200);
});

router.get('/notification-settings', async (c) => {
  const data = await getNotificationSettings(c.get('prisma'), getJwtNumericUserId(c) as number);
  return c.json(success('Notification settings', { data }), 200);
});

router.put('/notification-settings', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(error('Invalid JSON body', 400), 400);
  }
  const parsed = notificationSettingsSchema.safeParse(body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  const data = await updateNotificationSettings(
    c.get('prisma'),
    getJwtNumericUserId(c) as number,
    parsed.data,
  );
  return c.json(success('Notification settings updated', { data }), 200);
});

export default router;
