import { configureOpenAPI } from './config/index.js';
import createApp from './lib/create-app.js';
import graphql from './modules/graphql/index.js';
import health from './modules/health/index.js';
import metrics from './modules/metrics/index.js';
import index from './routes/index.route.js';
import restRoutes from './routes/rest/index.js';

const app = createApp();

configureOpenAPI(app);

app.route('/', index);
app.route('/', health);
app.route('/', metrics);
app.route('/', graphql);
app.route('/', restRoutes);

export type AppType = typeof app;

export default app;
