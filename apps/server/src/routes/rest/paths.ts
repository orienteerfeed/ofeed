import { ADMIN_OPENAPI } from '../../modules/admin/admin.openapi.js';
import { AUTH_OPENAPI } from '../../modules/auth/auth.openapi.js';
import { EVENT_OPENAPI } from '../../modules/event/event.openapi.js';
import { MAP_OPENAPI } from '../../modules/map/map.openapi.js';
import { UPLOAD_OPENAPI } from '../../modules/upload/upload.openapi.js';
import { USER_OPENAPI } from '../../modules/user/user.openapi.js';

export const REST_ROUTE_PATHS = {
  admin: ADMIN_OPENAPI.basePath,
  auth: AUTH_OPENAPI.basePath,
  events: EVENT_OPENAPI.basePath,
  map: MAP_OPENAPI.basePath,
  upload: UPLOAD_OPENAPI.basePath,
  myEvents: USER_OPENAPI.basePath,
} as const;
