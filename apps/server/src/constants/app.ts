export const APP_NAME = "OrienteerFeed API";

export const API_DEFAULTS = {
  BASE_PATH: "/rest/v1",
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200,
} as const;

export const HEALTH_CONFIG = {
  DB_TIMEOUT_MS: 2000,
} as const;
