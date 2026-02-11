import { configureOpenAPI } from "./config";
import createApp from "./lib/create-app";
import graphql from "./modules/graphql";
import health from "./modules/health";
import metrics from "./modules/metrics";
import index from "./routes/index.route";
import restRoutes from "./routes/rest/index.js";

const app = createApp();

configureOpenAPI(app);

app.route("/", index);
app.route("/", health);
app.route("/", metrics);
app.route("/", graphql);
app.route("/", restRoutes);

export type AppType = typeof app;

export default app;
