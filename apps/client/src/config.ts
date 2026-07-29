type RuntimeConfig = Partial<Record<keyof ImportMetaEnv, string>>;

declare global {
  interface Window {
    __OFEED_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

function runtimeValue(name: keyof ImportMetaEnv): string | undefined {
  if (typeof window !== 'undefined') {
    const value = window.__OFEED_RUNTIME_CONFIG__?.[name];
    if (value) {
      return value;
    }
  }

  return import.meta.env[name];
}

function browserOrigin(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.origin;
}

const asBool = (v: string | boolean | undefined) => v === true || v === 'true';
const optionalBool = (
  value: string | boolean | undefined,
  defaultValue: boolean
): boolean => (value === undefined ? defaultValue : asBool(value));

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
const DEBUG = asBool(runtimeValue('VITE_DEBUG_LOGGING'));

export const config = {
  // Required strings
  BASE_API_URL: required(
    'VITE_BASE_API_URL',
    runtimeValue('VITE_BASE_API_URL') ?? browserOrigin()
  ),

  // Optional strings with defaults
  PUBLIC_URL:
    runtimeValue('VITE_PUBLIC_URL') ??
    browserOrigin() ??
    import.meta.env.BASE_URL,
  DEFAULT_LANGUAGE: optional(runtimeValue('VITE_DEFAULT_LANGUAGE'), 'en'),
  SUPPORT_EMAIL: optional(
    runtimeValue('VITE_SUPPORT_EMAIL'),
    'support@orienteerfeed.com'
  ),
  DOCS_URL: optional(
    runtimeValue('VITE_DOCS_URL'),
    'https://docs.orienteerfeed.com'
  ),
  BOARD_APP_URL: optional(
    runtimeValue('VITE_BOARD_APP_URL'),
    'http://localhost:5173'
  ),
  DISCORD_INVITE_URL: optional(
    runtimeValue('VITE_DISCORD_INVITE_URL'),
    'https://discord.gg/QMvnurgKzU'
  ),
  GITHUB_REPO_URL: optional(
    runtimeValue('VITE_GITHUB_REPO_URL'),
    'https://github.com/orienteerfeed/ofeed'
  ),
  ENABLE_MAP_VIEW: optionalBool(runtimeValue('VITE_ENABLE_MAP_VIEW'), true),

  // Debug flags - all controlled by VITE_DEBUG_LOGGING
  DEBUG_LOGGING: DEBUG,
  REQUEST_LOGGING: DEBUG,
  I18N_LOGGING: DEBUG,
} as const;

export default config;
