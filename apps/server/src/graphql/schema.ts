import './scalars/date.scalar.js';
import './scalars/date-time.scalar.js';
import './scalars/constraint-scalars.js';

import '../modules/meos/meos.graphql.js';
import '../modules/country/country.graphql.js';
import '../modules/class/class.graphql.js';
import '../modules/sport/sport.graphql.js';
import '../modules/team/team.graphql.js';
import '../modules/event/event.graphql.js';
import '../modules/user/user.graphql.js';
import '../modules/split/split.graphql.js';
import '../modules/competitor/competitor.graphql.js';
import '../modules/changelog/changelog.graphql.js';
import '../modules/system-message/system-message.graphql.js';
import '../modules/start-slot-vacancy/start-slot-vacancy.graphql.js';

import { builder } from './builder.js';

export const schema = builder.toSchema({ sortSchema: false });
