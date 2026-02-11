export const DB_CONFIG = {
  TIMEOUTS: {
    CONNECTION: 30000,
    COMMAND: 30000,
    HEALTHCHECK: 2000,
  },
  POOL: {
    MIN_CONNECTIONS: 1,
    MAX_CONNECTIONS: 10,
  },
} as const;
