import { ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'

import type { ScrollType } from '@/types/layout'
import type { CategoryGender, ResultMode } from '@/types/category'
import { useSettingStore, type CategoryDisplay } from '@/stores/settings'

const QUERY_KEYS = [
  'scroll',
  'speed',
  'compact',
  'emojis',
  'unfinished',
  'pinned',
  'cols',
  'club',
  'reg',
  'hideEmpty',
  'announce',
  'cats',
] as const

const MAX_COLUMNS = 10

export interface DisplaySettingsUrlState {
  scrollType: ScrollType
  readLineTimeSeconds: number
  compactMode: boolean
  showEmojis: boolean
  showUnfinishedAthletes: boolean
  pinnedCount: number
  scrollColumnsCount: number
  showClub: boolean
  showRegistration: boolean
  hideEmptyCategories: boolean
  announceWinners: boolean
}

/** Must match the initial values in the settings store. */
export function createDisplaySettingsDefaults(): DisplaySettingsUrlState {
  return {
    scrollType: 'continues',
    readLineTimeSeconds: 1,
    compactMode: true,
    showEmojis: true,
    showUnfinishedAthletes: true,
    pinnedCount: 3,
    scrollColumnsCount: 1,
    showClub: false,
    showRegistration: false,
    hideEmptyCategories: true,
    announceWinners: true,
  }
}

const BOOLEAN_KEYS = {
  compact: 'compactMode',
  emojis: 'showEmojis',
  unfinished: 'showUnfinishedAthletes',
  club: 'showClub',
  reg: 'showRegistration',
  hideEmpty: 'hideEmptyCategories',
  announce: 'announceWinners',
} as const satisfies Record<string, keyof DisplaySettingsUrlState>

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
  if (value === undefined || value === '') return undefined
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
  for (const [key, field] of Object.entries(BOOLEAN_KEYS)) {
    if (state[field] !== defaults[field]) query[key] = state[field] ? '1' : '0'
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
  const result: Partial<DisplaySettingsUrlState> = {}
  const scrollType = parseScrollType(firstQueryValue(query.scroll))
  if (scrollType !== undefined) result.scrollType = scrollType
  const speed = parseFloatValue(firstQueryValue(query.speed), { min: 0.1, max: 4 })
  if (speed !== undefined) result.readLineTimeSeconds = speed
  for (const [key, field] of Object.entries(BOOLEAN_KEYS)) {
    const value = parseBoolean(firstQueryValue(query[key]))
    if (value !== undefined) result[field] = value
  }
  const pinnedCount = parseNumber(firstQueryValue(query.pinned), { min: 0, max: 10 })
  if (pinnedCount !== undefined) result.pinnedCount = pinnedCount
  const scrollColumnsCount = parseNumber(firstQueryValue(query.cols), {
    min: 1,
    max: MAX_COLUMNS,
  })
  if (scrollColumnsCount !== undefined) result.scrollColumnsCount = scrollColumnsCount
  return result
}

// Per-class settings: `cats=D10C:1:F:U:5,D10F:0,...`
// One entry per class in display order: name:column:color:mode:places.
// Column 0 = hidden class; empty color/mode/places = auto (trailing ones are dropped).
const MODE_CODES: Record<ResultMode, string> = {
  Default: 'D',
  Unordered: 'U',
  UnorderedNoTimes: 'N',
}
const MODES_BY_CODE = Object.fromEntries(
  Object.entries(MODE_CODES).map(([mode, code]) => [code, mode as ResultMode])
)

export type CategoryUrlEntry = Pick<
  CategoryDisplay,
  'name' | 'selected' | 'column' | 'colorOverride' | 'resultModeOverride' | 'awardedPlacesOverride'
>

const escapeName = (name: string) => name.replace(/[%,:]/g, encodeURIComponent)
function unescapeName(name: string) {
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

/** Returns undefined when the classes are in their default state (all shown, natural order, no overrides, one column). */
export function encodeCategories(
  categories: CategoryUrlEntry[],
  naturalOrder: string[],
  columnsCount: number
): string | undefined {
  const isDefault =
    columnsCount === 1 &&
    categories.length === naturalOrder.length &&
    categories.every(
      (c, i) =>
        c.name === naturalOrder[i] &&
        c.selected &&
        c.colorOverride == null &&
        c.resultModeOverride == null &&
        c.awardedPlacesOverride == null
    )
  if (isDefault) return undefined
  return categories
    .map((c) =>
      [
        escapeName(c.name),
        c.selected ? String(c.column ?? 1) : '0',
        c.colorOverride ?? '',
        c.resultModeOverride ? MODE_CODES[c.resultModeOverride] : '',
        c.awardedPlacesOverride ?? '',
      ]
        .join(':')
        .replace(/:+$/, '')
    )
    .join(',')
}

export function decodeCategories(value: string): CategoryUrlEntry[] {
  return value
    .split(',')
    .map((entry) => {
      const [rawName = '', column, color, mode, places] = entry.split(':')
      const columnNumber = parseNumber(column, { min: 0, max: MAX_COLUMNS }) ?? 1
      return {
        name: unescapeName(rawName),
        selected: columnNumber > 0,
        column: columnNumber > 0 ? columnNumber : null,
        colorOverride:
          color === 'M' || color === 'F' || color === 'X' ? (color as CategoryGender) : null,
        resultModeOverride: (mode && MODES_BY_CODE[mode]) || null,
        awardedPlacesOverride: parseNumber(places, { min: 0, max: 99 }) ?? null,
      }
    })
    .filter((entry) => entry.name !== '')
}

/**
 * Applies URL entries onto the known classes. Listed classes take the URL order,
 * unlisted ones keep their state and go last. Returns undefined when nothing matches
 * (e.g. a link from another competition) so the current settings stay untouched.
 */
export function applyCategoryEntries(
  categories: CategoryDisplay[],
  entries: CategoryUrlEntry[],
  columnsCount: number
): CategoryDisplay[] | undefined {
  const byName = new Map(categories.map((c) => [c.name, c]))
  const listed = entries.flatMap((entry) => {
    const existing = byName.get(entry.name)
    if (!existing) return []
    byName.delete(entry.name)
    return [
      {
        ...existing,
        ...entry,
        column: entry.selected ? Math.min(entry.column ?? 1, columnsCount) : null,
      },
    ]
  })
  if (!listed.length) return undefined
  const rest = categories.filter((c) => byName.has(c.name))
  return [...listed, ...rest].map((c, order) => ({ ...c, order }))
}

export function useDisplaySettingsUrlSync() {
  const route = useRoute()
  const router = useRouter()
  const settingsStore = useSettingStore()
  const defaults = createDisplaySettingsDefaults()
  // Classes arrive with the data; until then keep `cats` from the URL as-is.
  const categoriesReady = ref(false)

  const encodeStoreCategories = () =>
    encodeCategories(
      settingsStore.categoriesDisplay,
      settingsStore.availableCategories,
      settingsStore.scrollColumnsCount
    )

  const syncCategoriesFromRoute = () => {
    if (!settingsStore.availableCategories.length) return
    categoriesReady.value = true
    const cats = firstQueryValue(route.query.cats)
    if (!cats || cats === encodeStoreCategories()) return
    const next = applyCategoryEntries(
      settingsStore.categoriesDisplay,
      decodeCategories(cats),
      settingsStore.scrollColumnsCount
    )
    if (next) settingsStore.categoriesDisplayRaw = next
  }

  const syncFromRoute = () => {
    const next = parseDisplaySettingsQuery(route.query)
    if (next.scrollType !== undefined) settingsStore.setScrollType(next.scrollType)
    if (next.readLineTimeSeconds !== undefined) {
      settingsStore.readLineTimeSeconds = next.readLineTimeSeconds
    }
    for (const field of Object.values(BOOLEAN_KEYS)) {
      const value = next[field]
      if (value !== undefined) settingsStore[field] = value
    }
    if (next.pinnedCount !== undefined) settingsStore.pinnedCount = next.pinnedCount
    if (
      next.scrollColumnsCount !== undefined &&
      next.scrollColumnsCount !== settingsStore.scrollColumnsCount
    ) {
      settingsStore.setScrollColumnsCount(next.scrollColumnsCount)
    }
    // After columns: changing the column count redistributes classes.
    syncCategoriesFromRoute()
  }

  const buildStoreQuery = (): LocationQueryRaw => {
    const query = buildDisplaySettingsQuery(
      {
        scrollType: settingsStore.scrollType,
        readLineTimeSeconds: Number(settingsStore.readLineTimeSeconds),
        compactMode: settingsStore.compactMode,
        showEmojis: settingsStore.showEmojis,
        showUnfinishedAthletes: settingsStore.showUnfinishedAthletes,
        pinnedCount: settingsStore.pinnedCount,
        scrollColumnsCount: settingsStore.scrollColumnsCount,
        showClub: settingsStore.showClub,
        showRegistration: settingsStore.showRegistration,
        hideEmptyCategories: settingsStore.hideEmptyCategories,
        announceWinners: settingsStore.announceWinners,
      },
      defaults
    )
    const cats = categoriesReady.value ? encodeStoreCategories() : firstQueryValue(route.query.cats)
    if (cats) query.cats = cats
    return query
  }

  const syncToRoute = () => {
    const nextManagedQuery = buildStoreQuery()
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

  watch(() => QUERY_KEYS.map((key) => route.query[key]), syncFromRoute, {
    immediate: true,
  })
  watch(() => settingsStore.availableCategories, syncCategoriesFromRoute)
  watch(() => normalizeQuery(buildStoreQuery()), syncToRoute, { immediate: true })
}
