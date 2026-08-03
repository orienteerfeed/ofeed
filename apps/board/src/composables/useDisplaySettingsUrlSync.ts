import { watch } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'

import type { ScrollType } from '@/types/layout'
import { useSettingStore } from '@/stores/settings'

const QUERY_KEYS = [
  'scroll',
  'speed',
  'compact',
  'emojis',
  'unfinished',
  'pinned',
  'cols',
] as const

export interface DisplaySettingsUrlState {
  scrollType: ScrollType
  readLineTimeSeconds: number
  compactMode: boolean
  showEmojis: boolean
  showUnfinishedAthletes: boolean
  pinnedCount: number
  scrollColumnsCount: number
}

export function createDisplaySettingsDefaults(): DisplaySettingsUrlState {
  return {
    scrollType: 'page',
    readLineTimeSeconds: import.meta.env.PROD ? 0.3 : 0.1,
    compactMode: true,
    showEmojis: true,
    showUnfinishedAthletes: true,
    pinnedCount: 3,
    scrollColumnsCount: 1,
  }
}

function parseScrollType(value: string | undefined): ScrollType | undefined {
  if (
    value === 'none' ||
    value === 'continues' ||
    value === 'page' ||
    value === 'row'
  ) {
    return value
  }
  return undefined
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return undefined
}

function parseNumber(
  value: string | undefined,
  { min, max }: { min: number; max: number }
): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  const normalized = Math.trunc(parsed)
  if (normalized < min || normalized > max) return undefined
  return normalized
}

function parseFloatValue(
  value: string | undefined,
  { min, max }: { min: number; max: number }
): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return undefined
  if (parsed < min || parsed > max) return undefined
  return Number(parsed.toFixed(1))
}

function firstQueryValue(
  value: LocationQuery[string] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' ? first : undefined
  }
  return typeof value === 'string' ? value : undefined
}

function deleteManagedQueryKeys(query: LocationQuery): LocationQueryRaw {
  const nextQuery: LocationQueryRaw = {}
  for (const key of Object.keys(query)) {
    if ((QUERY_KEYS as readonly string[]).includes(key)) continue
    const value = query[key]
    if (value !== undefined && value !== null) {
      nextQuery[key] = value
    }
  }
  return nextQuery
}

function normalizeQuery(query: LocationQueryRaw): string {
  return JSON.stringify(
    Object.keys(query)
      .sort()
      .map((key) => [key, query[key]])
  )
}

function readManagedQuery(query: LocationQuery): LocationQueryRaw {
  const managedQuery: LocationQueryRaw = {}
  for (const key of QUERY_KEYS) {
    const value = query[key]
    if (value !== undefined && value !== null) {
      managedQuery[key] = value
    }
  }
  return managedQuery
}

export function buildDisplaySettingsQuery(
  state: DisplaySettingsUrlState,
  defaults: DisplaySettingsUrlState
): LocationQueryRaw {
  const query: LocationQueryRaw = {}
  if (state.scrollType !== defaults.scrollType) query.scroll = state.scrollType
  if (state.readLineTimeSeconds !== defaults.readLineTimeSeconds) {
    query.speed = state.readLineTimeSeconds.toFixed(1)
  }
  if (state.compactMode !== defaults.compactMode) query.compact = state.compactMode ? '1' : '0'
  if (state.showEmojis !== defaults.showEmojis) query.emojis = state.showEmojis ? '1' : '0'
  if (state.showUnfinishedAthletes !== defaults.showUnfinishedAthletes) {
    query.unfinished = state.showUnfinishedAthletes ? '1' : '0'
  }
  if (state.pinnedCount !== defaults.pinnedCount) query.pinned = String(state.pinnedCount)
  if (state.scrollColumnsCount !== defaults.scrollColumnsCount) {
    query.cols = String(state.scrollColumnsCount)
  }
  return query
}

export function parseDisplaySettingsQuery(
  query: LocationQuery
): Partial<DisplaySettingsUrlState> {
  const scrollType = parseScrollType(firstQueryValue(query.scroll))
  const speed = parseFloatValue(firstQueryValue(query.speed), { min: 0.1, max: 4 })
  const compact = parseBoolean(firstQueryValue(query.compact))
  const emojis = parseBoolean(firstQueryValue(query.emojis))
  const unfinished = parseBoolean(firstQueryValue(query.unfinished))
  const pinnedCount = parseNumber(firstQueryValue(query.pinned), { min: 0, max: 10 })
  const scrollColumnsCount = parseNumber(firstQueryValue(query.cols), {
    min: 1,
    max: 10,
  })

  return {
    scrollType,
    readLineTimeSeconds: speed,
    compactMode: compact,
    showEmojis: emojis,
    showUnfinishedAthletes: unfinished,
    pinnedCount,
    scrollColumnsCount,
  }
}

function syncStoreFromQuery(
  settingsStore: ReturnType<typeof useSettingStore>,
  query: LocationQuery
) {
  const next = parseDisplaySettingsQuery(query)
  if (next.scrollType !== undefined) settingsStore.setScrollType(next.scrollType)
  if (next.readLineTimeSeconds !== undefined) {
    settingsStore.readLineTimeSeconds = next.readLineTimeSeconds
  }
  if (next.compactMode !== undefined) settingsStore.compactMode = next.compactMode
  if (next.showEmojis !== undefined) settingsStore.showEmojis = next.showEmojis
  if (next.showUnfinishedAthletes !== undefined) {
    settingsStore.showUnfinishedAthletes = next.showUnfinishedAthletes
  }
  if (next.pinnedCount !== undefined) settingsStore.pinnedCount = next.pinnedCount
  if (next.scrollColumnsCount !== undefined) {
    settingsStore.setScrollColumnsCount(next.scrollColumnsCount)
  }
}

export function useDisplaySettingsUrlSync() {
  const route = useRoute()
  const router = useRouter()
  const settingsStore = useSettingStore()
  const defaults = createDisplaySettingsDefaults()

  const syncFromRoute = () => {
    syncStoreFromQuery(settingsStore, route.query)
  }

  const syncToRoute = () => {
    const nextManagedQuery = buildDisplaySettingsQuery(
      {
        scrollType: settingsStore.scrollType,
        readLineTimeSeconds: settingsStore.readLineTimeSeconds,
        compactMode: settingsStore.compactMode,
        showEmojis: settingsStore.showEmojis,
        showUnfinishedAthletes: settingsStore.showUnfinishedAthletes,
        pinnedCount: settingsStore.pinnedCount,
        scrollColumnsCount: settingsStore.scrollColumnsCount,
      },
      defaults
    )
    const currentManagedQuery = readManagedQuery(route.query)
    if (normalizeQuery(currentManagedQuery) === normalizeQuery(nextManagedQuery)) {
      return
    }
    const query = {
      ...deleteManagedQueryKeys(route.query),
      ...nextManagedQuery,
    }
    router.replace({ query, hash: route.hash })
  }

  watch(
    () => [
      route.query.scroll,
      route.query.speed,
      route.query.compact,
      route.query.emojis,
      route.query.unfinished,
      route.query.pinned,
      route.query.cols,
    ],
    syncFromRoute,
    { immediate: true }
  )

  watch(
    () => [
      settingsStore.scrollType,
      settingsStore.readLineTimeSeconds,
      settingsStore.compactMode,
      settingsStore.showEmojis,
      settingsStore.showUnfinishedAthletes,
      settingsStore.pinnedCount,
      settingsStore.scrollColumnsCount,
    ],
    syncToRoute,
    { immediate: true }
  )
}
