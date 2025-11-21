const asBool = (v: string | boolean | undefined) => v === true || v === 'true';

function required(
  name: keyof ImportMetaEnv,
  value: string | undefined
): string {
  if (!value) {
    throw new Error(`[config] Missing required env: ${name}`);
  }
  return value;
}

function optional(value: string | undefined, defaultValue: string): string {
  return value ?? defaultValue;
}

// Master debug flag controls all logging
const DEBUG = asBool(import.meta.env.VITE_DEBUG_LOGGING);

export const config = {
  // Required strings
  BASE_API_URL: required(
    'VITE_BASE_API_URL',
    import.meta.env.VITE_BASE_API_URL
  ),

  // Optional strings with defaults
  PUBLIC_URL: import.meta.env.VITE_PUBLIC_URL ?? import.meta.env.BASE_URL,
  DEFAULT_LANGUAGE: optional(import.meta.env.VITE_DEFAULT_LANGUAGE, 'en'),
  SUPPORT_EMAIL: optional(
    import.meta.env.VITE_SUPPORT_EMAIL,
    'support@orienteerfeed.com'
  ),
  DOCS_URL: optional(
    import.meta.env.VITE_DOCS_URL,
    'https://docs.orienteerfeed.com'
  ),

  // Debug flags - all controlled by VITE_DEBUG_LOGGING
  DEBUG_LOGGING: DEBUG,
  REQUEST_LOGGING: DEBUG,
  I18N_LOGGING: DEBUG,
} as const;

export default config;
