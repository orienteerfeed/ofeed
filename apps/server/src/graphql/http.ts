import { createYoga } from "graphql-yoga";

import { toLowerCaseHeaderRecord } from "../lib/http/headers.js";
import prisma from "../utils/context.js";
import { buildAuthContextFromRequest } from "../utils/jwtToken.js";

import { schemaWithDirectives } from "./executableSchema.js";

type YogaContext = {
  prisma: typeof prisma;
  auth: Awaited<ReturnType<typeof buildAuthContextFromRequest>>;
  activationUrl: string;
  resetPasswordUrl: string;
};

export const yoga = createYoga<{
  requestId?: string;
}>({
  schema: schemaWithDirectives,
  graphqlEndpoint: "/graphql",
  context: async ({ request }): Promise<YogaContext> => {
    const auth = await buildAuthContextFromRequest({ headers: toLowerCaseHeaderRecord(request.headers) });

    return {
      prisma,
      auth,
      activationUrl: request.headers.get("x-orienteerfeed-app-activate-user-url") ?? "localhost",
      resetPasswordUrl: request.headers.get("x-ofeed-app-reset-password-url") ?? "localhost",
    };
  },
});
