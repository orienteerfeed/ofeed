type BoardRuntimeConfig = Partial<{
  VITE_OFEED_API_URL: string
  VITE_OFEED_GQL_WS_URL: string
  VITE_PROVIDERS: string
}>

declare global {
  interface Window {
    __OFEED_BOARD_RUNTIME_CONFIG__?: BoardRuntimeConfig
  }
}

export function boardRuntimeValue(
  key: keyof BoardRuntimeConfig
): string | undefined {
  const runtimeValue =
    typeof window === 'undefined'
      ? undefined
      : window.__OFEED_BOARD_RUNTIME_CONFIG__?.[key]

  return runtimeValue || import.meta.env[key]
}
