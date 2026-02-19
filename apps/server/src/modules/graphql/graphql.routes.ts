import { createRouter } from "../../lib/create-app";

import { graphQLHttpHandler } from "./graphql.handlers.js";
import { GRAPHQL_OPENAPI } from "./graphql.openapi.js";

const router = createRouter();

router.get(GRAPHQL_OPENAPI.path, graphQLHttpHandler);
router.post(GRAPHQL_OPENAPI.path, graphQLHttpHandler);
router.options(GRAPHQL_OPENAPI.path, graphQLHttpHandler);

export default router;
