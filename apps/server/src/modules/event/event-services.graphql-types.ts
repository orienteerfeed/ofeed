import { builder } from '../../graphql/builder.js';
import { SYSTEM_EVENT_SERVICE_KEYS } from './event-services.service.js';

export const EventServiceSystemKeyRef = builder.enumType('EventServiceSystemKey', {
  values: SYSTEM_EVENT_SERVICE_KEYS,
});
