/// <reference types="vite/client" />

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

export const config = {
  // booleans (default false if unset)
  REQUEST_LOGGING: asBool(import.meta.env.VITE_REQUEST_LOGGING),
  I18N_LOGGING: asBool(import.meta.env.VITE_I18N_LOGGING),

  // required string (throw if missing in runtime)
  BASE_API_URL: required(
    'VITE_BASE_API_URL',
    import.meta.env.VITE_BASE_API_URL
  ),

  // public URL/base path; prefer Vite’s BASE_URL unless you need a custom var
  PUBLIC_URL: import.meta.env.VITE_PUBLIC_URL ?? import.meta.env.BASE_URL,
} as const;
