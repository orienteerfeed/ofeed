import { ref, reactive, computed, watch } from 'vue'
import { defineStore } from 'pinia'

import type { ScrollType } from '@/types/layout'
import {
  DEFAULT_AWARDED_PLACES,
  type CategoryGender,
  type CategorySourceSettings,
  type ResultMode,
} from '@/types/category'

type CategoryDisplay = {
  name: string
  selected: boolean
  column: null | number
  order: number
  colorOverride?: CategoryGender | null
  resultModeOverride?: ResultMode | null
  awardedPlacesOverride?: number | null
}

type CategoryOverrides = Pick<
  CategoryDisplay,
  'colorOverride' | 'resultModeOverride' | 'awardedPlacesOverride'
>

type CategoryDisplaySelected = Omit<CategoryDisplay, 'column'> & {
  column: number
}

export const useSettingStore = defineStore(
  'settings',
  () => {
    const areSettingsDisplayed = ref(false)
    function setSettingsDisplayed(status?: boolean) {
      if (typeof status === 'undefined')
        areSettingsDisplayed.value = !areSettingsDisplayed.value
      else areSettingsDisplayed.value = status
    }

    const compactMode = ref(true)
    const showEmojis = ref(true)
    const pinnedCount = ref(3)

    const scrollType = ref<ScrollType>('continues')

    const scrollColumnsCount = ref(1)
    function setScrollColumnsCount(count: number) {
      scrollColumnsCount.value = count
      autoUpdateCategoryDisplayColumns()
    }

    const readLineTimeSeconds = ref(1)
    const readLineTimeMS = computed(() => readLineTimeSeconds.value * 1000)
    function setScrollType(type: ScrollType) {
      scrollType.value = type
    }

    const showUnfinishedAthletes = ref(true)
    const announceWinners = ref(true)

    const availableCategories = ref<string[]>([])
    const categoryCounts = reactive<Record<string, number>>({})
    function updateCategoryCount(name: string, count: number) {
      categoryCounts[name] = count
    }
    const categoriesDisplayRaw = ref<CategoryDisplay[]>([])
    const setAvailableCategories = (categories: string[]) => {
      if (
        !categories.length ||
        JSON.stringify(categories) === JSON.stringify(availableCategories.value)
      )
        return // Bugfix skip rewrite update
      availableCategories.value = categories
      // Keep persisted per-class settings; only add new classes and drop gone ones.
      const known = new Map(categoriesDisplayRaw.value.map((c) => [c.name, c]))
      const merged = categories.map(
        (name, index) =>
          known.get(name) ??
          createSelectedCategoryItem(name, categoriesDisplayRaw.value.length + index)
      )
      categoriesDisplayRaw.value = merged
        .sort((a, b) => a.order - b.order)
        .map((c, order) => ({ ...c, order }))
      const hasNew = categories.some((name) => !known.has(name))
      if (hasNew && scrollColumnsCount.value > 1) {
        autoUpdateCategoryDisplayColumns()
      }
    }

    // Class settings defined by the data source (not persisted, they win).
    const categorySources = reactive<Record<string, CategorySourceSettings>>({})
    function updateCategorySource(name: string, source: CategorySourceSettings) {
      categorySources[name] = source
    }

    function resolveCategorySettings(
      name: string,
      source: CategorySourceSettings = categorySources[name] ?? {}
    ) {
      const display = categoriesDisplayRaw.value.find((c) => c.name === name)
      return {
        colorOverride: source.gender ?? display?.colorOverride ?? undefined,
        resultMode: source.resultMode ?? display?.resultModeOverride ?? 'Default',
        awardedPlaces:
          source.awardedPlaces ??
          display?.awardedPlacesOverride ??
          DEFAULT_AWARDED_PLACES,
      }
    }

    const categoriesDisplay = computed(() => {
      return categoriesDisplayRaw.value.sort((a, b) => a.order - b.order)
    })
    const categoriesSelected = computed((): CategoryDisplaySelected[] => {
      return categoriesDisplay.value.filter(
        (c): c is CategoryDisplaySelected => c.selected
      )
    })

    const categoriesDisplayByColumn = ref<CategoryDisplaySelected[][]>([])
    const createArrayOfNEmptyArrays = <T>(n: number): T[][] => {
      return Array.from({ length: n }, () => [])
    }
    watch([categoriesSelected, scrollColumnsCount], updateCategoriesByColumn, {
      immediate: true,
    })
    function updateCategoriesByColumn() {
      categoriesDisplayByColumn.value = categoriesSelected.value.reduce(
        (columns, category) => {
          const column = columns[category.column - 1]
          if (column) {
            column.push(category)
          }
          return columns
        },
        createArrayOfNEmptyArrays<CategoryDisplaySelected>(
          scrollColumnsCount.value
        )
      )
    }

    function createSelectedCategoryItem(
      category: string,
      index: number
    ): CategoryDisplay {
      return {
        name: category,
        selected: true,
        column: 1,
        order: index,
        colorOverride: null,
        resultModeOverride: null,
        awardedPlacesOverride: null,
      }
    }

    function setCategoryOverride(
      category: CategoryDisplay,
      overrides: CategoryOverrides
    ) {
      const idx = categoriesDisplayRaw.value.findIndex((c) => c.name === category.name)
      const existing = categoriesDisplayRaw.value[idx]
      if (idx !== -1 && existing) {
        categoriesDisplayRaw.value[idx] = { ...existing, ...overrides }
      }
    }

    function setCategoryColorOverride(
      category: CategoryDisplay,
      color: CategoryGender | null
    ) {
      setCategoryOverride(category, { colorOverride: color })
    }

    function setCategorySelected(
      category: CategoryDisplay,
      selected?: boolean
    ) {
      const selectedStatus = selected ?? !category.selected
      category.selected = selectedStatus
      if (scrollColumnsCount.value === 1)
        category.column = selectedStatus ? 1 : null
      else autoUpdateCategoryDisplayColumns()
    }

    function setCategoryDisplayColumn(
      category: CategoryDisplay,
      columnNumber: number
    ) {
      if (!category.selected) return
      if (columnNumber > scrollColumnsCount.value) return
      category.column = columnNumber
      updateCategoriesByColumn()
    }

    function setCategoryDisplayOrder(category: CategoryDisplay, up: boolean) {
      const currentOrder = category.order
      const newOrder = up ? currentOrder - 1 : currentOrder + 1
      const formerCategoryAtOrder = categoriesDisplay.value[newOrder]
      if (!formerCategoryAtOrder) return
      formerCategoryAtOrder.order = currentOrder
      category.order = newOrder
    }

    function moveCategoryToIndex(fromName: string, toName: string) {
      if (fromName === toName) return
      const sorted = [...categoriesDisplay.value]
      const fromIdx = sorted.findIndex((c) => c.name === fromName)
      const toIdx = sorted.findIndex((c) => c.name === toName)
      if (fromIdx === -1 || toIdx === -1) return
      const moved = sorted.splice(fromIdx, 1)[0]
      if (!moved) return
      sorted.splice(toIdx, 0, moved)
      categoriesDisplayRaw.value = sorted.map((c, i) => ({ ...c, order: i }))
    }

    function selectCategories(categories: CategoryDisplay[], selected: boolean) {
      for (const category of categories) {
        category.selected = selected
        if (scrollColumnsCount.value === 1)
          category.column = selected ? 1 : null
      }
      autoUpdateCategoryDisplayColumns()
    }

    function autoUpdateCategoryDisplayColumns() {
      const categoriesByColumn = splitArrayIntoPartsImmutable(
        categoriesSelected.value,
        scrollColumnsCount.value
      )
      for (let i = 0; i < categoriesByColumn.length; i++) {
        for (const category of categoriesByColumn[i] ?? []) {
          category.column = i + 1
        }
      }
      updateCategoriesByColumn()
    }

    return {
      areSettingsDisplayed,
      setSettingsDisplayed,

      compactMode,
      showEmojis,
      pinnedCount,

      scrollType,
      setScrollType,

      scrollColumnsCount,
      setScrollColumnsCount,

      readLineTimeSeconds,
      readLineTimeMS,

      showUnfinishedAthletes,
      announceWinners,
      availableCategories,
      categoryCounts,
      updateCategoryCount,
      categorySources,
      updateCategorySource,
      resolveCategorySettings,
      categoriesDisplayRaw, // Export for persist to work
      categoriesDisplay,
      categoriesDisplayByColumn,
      setAvailableCategories,
      setCategoryDisplayColumn,
      setCategoryDisplayOrder,
      setCategorySelected,
      selectCategories,
      setCategoryColorOverride,
      setCategoryOverride,
      moveCategoryToIndex,
    }
  },
  {
    persist: {
      pick: [
        'compactMode', 'showEmojis', 'pinnedCount',
        'scrollType', 'scrollColumnsCount', 'readLineTimeSeconds',
        'showUnfinishedAthletes', 'announceWinners', 'categoriesDisplayRaw',
      ],
    },
  }
)

function splitArrayIntoPartsImmutable<T>(arr: T[], parts: number): T[][] {
  const result = []
  const arrayCopy = [...arr]
  const itemsPerPart = Math.round(arr.length / parts)
  for (let i = parts; i > 1; i--) {
    result.push(arrayCopy.splice(0, itemsPerPart))
  }
  result.push(arrayCopy)
  return result
}
