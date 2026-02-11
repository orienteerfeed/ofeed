import dotenvFlow from "dotenv-flow";
import { z } from "@hono/zod-openapi";

dotenvFlow.config();

const DEFAULT_DATABASE_URL = "mysql://user:password@localhost:3306/orienteerfeed";

function hasTemplatePlaceholders(value: string) {
  return /\$\{[^}]+\}/.test(value);
}

function buildDatabaseUrlFromMysqlEnv(source: {
  MYSQL_USER?: string;
  MYSQL_PASSWORD?: string;
  MYSQL_HOST?: string;
  MYSQL_PORT?: string;
  MYSQL_DATABASE?: string;
}) {
  const user = source.MYSQL_USER?.trim();
  const host = source.MYSQL_HOST?.trim() || "localhost";
  const database = source.MYSQL_DATABASE?.trim() || "orienteerfeed";
  const port = source.MYSQL_PORT?.trim() || "3306";
  const password = source.MYSQL_PASSWORD ?? "";

  if (!user) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const auth = password.length > 0 ? `${encodedUser}:${encodedPassword}` : encodedUser;

  return `mysql://${auth}@${host}:${port}/${database}`;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  MYSQL_DATABASE: z.string().optional(),
  MYSQL_USER: z.string().optional(),
  MYSQL_PASSWORD: z.string().optional(),
  MYSQL_HOST: z.string().optional(),
  MYSQL_PORT: z.string().optional(),

  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  JWT_TOKEN_SECRET_KEY: z.string().default("change-me-in-production"),
  ENCRYPTION_SECRET_KEY: z.string().optional(),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  CORS_METHODS: z.string().default("GET,HEAD,POST,PUT,DELETE,OPTIONS"),
  CORS_HEADERS: z.string().default("Content-Type,Authorization,x-orienteerfeed-app-activate-user-url,x-ofeed-app-reset-password-url"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(200),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_DIR: z.string().default("logs"),
  ENABLE_ACCESS_LOG: z.coerce.boolean().default(true),
  ENABLE_APP_LOG: z.coerce.boolean().default(true),
  LOG_ROTATION_ENABLED: z.coerce.boolean().default(true),
  LOG_ROTATION_FREQUENCY: z.enum(["daily", "hourly", "weekly"]).default("daily"),
  LOG_RETENTION_DAYS: z.coerce.number().min(1).max(365).default(14),
  LOG_COMPRESSION: z.coerce.boolean().default(true),
  LOG_ROTATION_BOUNDARY: z.coerce.boolean().default(true),
  LOG_ROTATION_UTC: z.coerce.boolean().default(false),

  OPENAPI_TITLE: z.string().default("OrienteerFeed API"),
  OPENAPI_DOC_PATH: z.string().default("/doc"),
  OPENAPI_REFERENCE_PATH: z.string().default("/reference"),

  MAX_DEFAULT_BODY_SIZE_BYTES: z.coerce.number().default(1 * 1024 * 1024),
  ENABLE_COMPRESSION: z.coerce.boolean().default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

const fromMysqlEnv = buildDatabaseUrlFromMysqlEnv(env);

if (!env.DATABASE_URL || hasTemplatePlaceholders(env.DATABASE_URL)) {
  if (!fromMysqlEnv) {
    console.error(
      "Invalid database configuration: DATABASE_URL contains placeholders but MYSQL_USER, MYSQL_HOST and MYSQL_DATABASE are not fully set.",
    );
    process.exit(1);
  }

  env.DATABASE_URL = fromMysqlEnv;
}

if (env.DATABASE_URL === DEFAULT_DATABASE_URL && fromMysqlEnv) {
  env.DATABASE_URL = fromMysqlEnv;
}

if (env.NODE_ENV === "production") {
  if (env.JWT_TOKEN_SECRET_KEY === "change-me-in-production") {
    console.error("Invalid production environment variable: JWT_TOKEN_SECRET_KEY must be set.");
    process.exit(1);
  }
}

export default env;
export type Env = typeof env;
