import adminRouter from '../../modules/admin/index.js';
import authRouter from '../../modules/auth/index.js';
import bankConnectionRouter, { bankTransactionRoutes } from '../../modules/bank/index.js';
import devicesRouter from '../../modules/devices/index.js';
import eventRouter from '../../modules/event/index.js';
import mapRouter from '../../modules/map/index.js';
import meosRouter from '../../modules/meos/index.js';
import registrationRouter from '../../modules/registration/index.js';
import uploadRouter from '../../modules/upload/index.js';
import userRouter from '../../modules/user/index.js';

import { REST_ROUTE_PATHS } from './paths.js';

export const REST_ROUTE_REGISTRY = [
  { path: REST_ROUTE_PATHS.admin, router: adminRouter },
  { path: REST_ROUTE_PATHS.auth, router: authRouter },
  { path: REST_ROUTE_PATHS.bankConnections, router: bankConnectionRouter },
  { path: REST_ROUTE_PATHS.bankTransactions, router: bankTransactionRoutes },
  { path: REST_ROUTE_PATHS.devices, router: devicesRouter },
  { path: REST_ROUTE_PATHS.events, router: eventRouter },
  { path: REST_ROUTE_PATHS.map, router: mapRouter },
  { path: REST_ROUTE_PATHS.meos, router: meosRouter },
  { path: REST_ROUTE_PATHS.registration, router: registrationRouter },
  { path: REST_ROUTE_PATHS.upload, router: uploadRouter },
  { path: REST_ROUTE_PATHS.myEvents, router: userRouter },
] as const;
