import type { Context } from "hono";

import { yoga } from "./graphql.service.js";

export function graphQLHttpHandler(c: Context) {
  return yoga.fetch(c.req.raw);
}

