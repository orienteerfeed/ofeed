import { yoga } from './graphql.service.js';

type GraphQLRequestLike = {
  req: {
    raw: Request;
  };
};

export async function graphQLHttpHandler(c: GraphQLRequestLike) {
  const responseHeaders = new Headers();
  const response = await yoga.fetch(c.req.raw, { responseHeaders });
  const headers = new Headers(response.headers);
  responseHeaders.forEach((value, key) => headers.set(key, value));
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
