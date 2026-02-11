import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

import env from "../config/env";

export function createPrismaClient(databaseUrl = env.DATABASE_URL) {
  return new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
  });
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>;
