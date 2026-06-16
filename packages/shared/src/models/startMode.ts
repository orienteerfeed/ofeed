import type { StartMode } from "./common.js";

export function resolveEffectiveStartMode(
  classStartMode: StartMode | null | undefined,
  eventDefaultStartMode: StartMode,
): StartMode {
  return classStartMode ?? eventDefaultStartMode;
}
