import { yoga } from "./graphql.service.js";

type GraphQLRequestLike = {
  req: {
    raw: Request;
  };
};

export function graphQLHttpHandler(c: GraphQLRequestLike) {
  return yoga.fetch(c.req.raw);
}
