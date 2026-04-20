import { computed, watch, type Ref } from 'vue'
import { useTableSizingStore } from '@/stores/tableSizing'
import { useDataProvider } from './providers/useDataProvider'

export function useCompetition(id: Ref<string>) {
  const { getCompetitionLoader } = useDataProvider()
  const { competition, status } = getCompetitionLoader(id)
  const tableSizing = useTableSizingStore()

  const sortedCategories = computed(() => {
    if (!competition.value) return []
    const categoriesCopy = [...competition.value.categories]
    return categoriesCopy.sort((a, b) => a.name.localeCompare(b.name))
  })

  const competitionWithSortedCategories = computed(() => {
    if (!competition.value) return undefined
    return {
      ...competition.value,
      categories: sortedCategories.value,
    }
  })

  watch(
    () => competition.value?.isRelay,
    (isRelay, oldIsRelay) => {
      if (!isRelay || isRelay === oldIsRelay) return
      tableSizing.mode = isRelay ? 'relay' : 'single'
    },
    { immediate: true }
  )

  return { competition: competitionWithSortedCategories, status }
}
