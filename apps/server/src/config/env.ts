import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from '@hono/zod-openapi';

function resolveDotenvFiles(nodeEnv: string) {
  // process.loadEnvFile does not override existing keys, so more specific files must go first.
  const files = [`.env.${nodeEnv}`, '.env'];

  // Keep test env deterministic and avoid leaking local overrides into CI tests.
  if (nodeEnv !== 'test') {
    files.unshift(`.env.${nodeEnv}.local`, '.env.local');
  }

  return files.map((file) => path.resolve(process.cwd(), file));
}

function loadDotenvFiles() {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').trim() || 'development';
  for (const filePath of resolveDotenvFiles(nodeEnv)) {
    if (!existsSync(filePath)) {
      continue;
    }

    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(filePath);
      continue;
    }

    // Fallback parser for runtimes without process.loadEnvFile.
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
        continue;
      }

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      value = value.replace(/\\n/g, '\n');

      process.env[key] = value;
    }
  }
}

loadDotenvFiles();

const DEFAULT_DATABASE_URL = 'mysql://user:password@localhost:3306/orienteerfeed';
const DEFAULT_ENCRYPTION_SECRET_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TRUE_BOOLEAN_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_BOOLEAN_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

function normalizeRawEnv(source: NodeJS.ProcessEnv) {
  const normalized: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') {
      continue;
    }

    if (value.trim() === '') {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function hasTemplatePlaceholders(value: string) {
  return /\$\{[^}]+\}/.test(value);
}

export function parseBooleanEnvValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (TRUE_BOOLEAN_ENV_VALUES.has(normalized)) {
      return true;
    }

    if (FALSE_BOOLEAN_ENV_VALUES.has(normalized)) {
      return false;
    }
  }

  return value;
}

function booleanEnv(defaultValue: boolean) {
  return z.preprocess(parseBooleanEnvValue, z.boolean()).default(defaultValue);
}

function buildDatabaseUrlFromMysqlEnv(source: {
  MYSQL_USER?: string;
  MYSQL_PASSWORD?: string;
  MYSQL_HOST?: string;
  MYSQL_PORT?: string;
  MYSQL_DATABASE?: string;
}) {
  const user = source.MYSQL_USER?.trim();
  const host = source.MYSQL_HOST?.trim() || 'localhost';
  const database = source.MYSQL_DATABASE?.trim() || 'orienteerfeed';
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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  MYSQL_DATABASE: z.string().optional(),
  MYSQL_USER: z.string().optional(),
  MYSQL_PASSWORD: z.string().optional(),
  MYSQL_HOST: z.string().optional(),
  MYSQL_PORT: z.string().optional(),

  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  JWT_TOKEN_SECRET_KEY: z.string().default('change-me-in-production'),
  ENCRYPTION_SECRET_KEY: z.string().default(DEFAULT_ENCRYPTION_SECRET_KEY),
  ORIS_API_BASE_URL: z.string().url().default('https://oris.orientacnisporty.cz/API/'),
  EVENTOR_API_BASE_URL: z.string().url().default('https://eventor.orienteering.sport/api'),
  EVENTOR_API_KEY: z.string().optional(),
  MAPY_API_KEY: z.string().optional(),
  MAP_TILE_COOKIE_SECRET: z.string().optional(),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_METHODS: z.string().default('GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS'),
  CORS_HEADERS: z
    .string()
    .default(
      'Content-Type,Authorization,x-orienteerfeed-app-activate-user-url,x-ofeed-app-reset-password-url',
    ),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(200),
  MAP_TILE_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  MAP_TILE_RATE_LIMIT_MAX: z.coerce.number().default(2000),
  MAP_TILE_SESSION_REQUIRED: booleanEnv(false),
  MAP_TILE_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_DIR: z.string().default('logs'),
  ENABLE_ACCESS_LOG: booleanEnv(true),
  ENABLE_APP_LOG: booleanEnv(true),
  LOG_ROTATION_ENABLED: booleanEnv(true),
  LOG_ROTATION_FREQUENCY: z.enum(['daily', 'hourly', 'weekly']).default('daily'),
  LOG_RETENTION_DAYS: z.coerce.number().min(1).max(365).default(14),
  LOG_COMPRESSION: booleanEnv(true),
  LOG_ROTATION_BOUNDARY: booleanEnv(true),
  LOG_ROTATION_UTC: booleanEnv(false),

  OPENAPI_TITLE: z.string().default('OrienteerFeed API'),
  OPENAPI_DOC_PATH: z.string().default('/doc'),
  OPENAPI_REFERENCE_PATH: z.string().default('/reference'),

  MAX_DEFAULT_BODY_SIZE_BYTES: z.coerce.number().default(1 * 1024 * 1024),
  MAX_UPLOAD_BODY_SIZE_BYTES: z.coerce.number().default(5 * 1024 * 1024),
  ENABLE_COMPRESSION: booleanEnv(true),
});

const parsed = envSchema.safeParse(normalizeRawEnv(process.env));

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

const fromMysqlEnv = buildDatabaseUrlFromMysqlEnv(env);

if (!env.DATABASE_URL || hasTemplatePlaceholders(env.DATABASE_URL)) {
  if (!fromMysqlEnv) {
    if (env.NODE_ENV === 'production') {
      console.error(
        'Invalid database configuration: DATABASE_URL contains placeholders but MYSQL_USER, MYSQL_HOST and MYSQL_DATABASE are not fully set.',
      );
      process.exit(1);
    }

    env.DATABASE_URL = DEFAULT_DATABASE_URL;
  } else {
    env.DATABASE_URL = fromMysqlEnv;
  }
}

if (env.DATABASE_URL === DEFAULT_DATABASE_URL && fromMysqlEnv) {
  env.DATABASE_URL = fromMysqlEnv;
}

if (env.NODE_ENV === 'production') {
  if (env.JWT_TOKEN_SECRET_KEY === 'change-me-in-production') {
    console.error('Invalid production environment variable: JWT_TOKEN_SECRET_KEY must be set.');
    process.exit(1);
  }

  if (env.ENCRYPTION_SECRET_KEY === DEFAULT_ENCRYPTION_SECRET_KEY) {
    console.error('Invalid production environment variable: ENCRYPTION_SECRET_KEY must be set.');
    process.exit(1);
  }
}

export default env;
export type Env = typeof env;
