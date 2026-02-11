import { createRouter } from "../../lib/create-app";

import { graphQLHttpHandler } from "./graphql.handlers.js";
import { GRAPHQL_OPENAPI } from "./graphql.openapi.js";

const router = createRouter();

router.on(["GET", "POST", "OPTIONS"], GRAPHQL_OPENAPI.path, graphQLHttpHandler);

export default router;

