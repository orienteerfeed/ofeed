import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'

import type { ScrollType } from '@/types/layout'

type CategoryDisplay = {
  name: string
  selected: boolean
  column: null | number
  order: number
}

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

    const scrollType = ref<ScrollType>('page')

    const scrollColumnsCount = ref(1)
    function setScrollColumnsCount(count: number) {
      scrollColumnsCount.value = count
      autoUpdateCategoryDisplayColumns()
    }

    const readLineTimeSeconds = ref(import.meta.env.PROD ? 0.5 : 0.1)
    const readLineTimeMS = computed(() => readLineTimeSeconds.value * 1000)
    function setScrollType(type: ScrollType) {
      scrollType.value = type
    }

    const showUnfinishedAthletes = ref(true)

    const availableCategories = ref<string[]>([])
    const categoriesDisplayRaw = ref<CategoryDisplay[]>([])
    const setAvailableCategories = (categories: string[]) => {
      if (
        !categories.length ||
        JSON.stringify(categories) === JSON.stringify(availableCategories.value)
      )
        return // Bugfix skip rewrite update
      availableCategories.value = categories
      categoriesDisplayRaw.value = categories.map(createSelectedCategoryItem)
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
      }
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

      scrollType,
      setScrollType,

      scrollColumnsCount,
      setScrollColumnsCount,

      readLineTimeSeconds,
      readLineTimeMS,

      showUnfinishedAthletes,
      availableCategories,
      categoriesDisplayRaw, // Export for persist to work
      categoriesDisplay,
      categoriesDisplayByColumn,
      setAvailableCategories,
      setCategoryDisplayColumn,
      setCategoryDisplayOrder,
      setCategorySelected,
    }
  },
  {
    persist: true,
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
