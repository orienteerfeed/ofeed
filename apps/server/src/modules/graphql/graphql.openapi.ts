import { jsonBody, okJson, okText, zodToOpenApiSchema } from "../../config/openapi.helpers";
import type { OpenApiPathItem } from "../../config/openapi.types";
import { graphQLRequestSchema } from "./graphql.schema.js";

export const GRAPHQL_OPENAPI = {
  tag: "GraphQL",
  path: "/graphql",
} as const;

const graphQLRequestBodySchema = zodToOpenApiSchema(graphQLRequestSchema);

export const GRAPHQL_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [GRAPHQL_OPENAPI.path]: {
    get: {
      tags: [GRAPHQL_OPENAPI.tag],
      operationId: "graphqlGet",
      summary: "GraphQL endpoint (GET)",
      description: "GraphQL endpoint for queries",
      security: [],
      responses: {
        200: okJson("GraphQL response", "object"),
      },
    },
    post: {
      tags: [GRAPHQL_OPENAPI.tag],
      operationId: "graphqlPost",
      summary: "GraphQL endpoint (POST)",
      description: "GraphQL endpoint for queries and mutations",
      security: [],
      requestBody: jsonBody(graphQLRequestBodySchema),
      responses: {
        200: okJson("GraphQL response", "object"),
      },
    },
    options: {
      tags: [GRAPHQL_OPENAPI.tag],
      operationId: "graphqlOptions",
      summary: "GraphQL CORS preflight",
      description: "CORS preflight for GraphQL endpoint",
      security: [],
      responses: {
        200: okText("CORS preflight response"),
      },
    },
  },
};
