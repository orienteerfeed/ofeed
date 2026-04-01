import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const DEFAULT_DATABASE_URL = 'mysql://user:password@localhost:3306/ofeed';

function loadLocalDotEnv() {
  const configDirectory = dirname(fileURLToPath(import.meta.url));
  const envFilePath = join(configDirectory, '.env');

  if (!existsSync(envFilePath)) {
    return;
  }

  const file = readFileSync(envFilePath, 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const source = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = source.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = source.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue;
    }

    let value = source.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadLocalDotEnv();

function buildDatabaseUrlFromMysqlEnv(source: NodeJS.ProcessEnv) {
  const user = source.MYSQL_USER?.trim();
  const host = source.MYSQL_HOST?.trim() || 'localhost';
  const database = source.MYSQL_DATABASE?.trim() || 'ofeed';
  const port = source.MYSQL_PORT?.trim() || '3306';
  const password = source.MYSQL_PASSWORD ?? '';

  if (!user) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const auth = password.length > 0 ? `${encodedUser}:${encodedPassword}` : encodedUser;

  return `mysql://${auth}@${host}:${port}/${database}`;
}

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  buildDatabaseUrlFromMysqlEnv(process.env) ||
  DEFAULT_DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
