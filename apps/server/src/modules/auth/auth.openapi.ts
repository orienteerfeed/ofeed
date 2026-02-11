import { API_DEFAULTS } from "../../constants/index.js";

export const AUTH_OPENAPI = {
  tag: "Auth",
  basePath: `${API_DEFAULTS.BASE_PATH}/auth`,
} as const;

