import { z } from "@hono/zod-openapi";

export const graphQLRequestSchema = z.object({
  query: z.string().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  operationName: z.string().optional(),
});

export type GraphQLRequest = z.infer<typeof graphQLRequestSchema>;

