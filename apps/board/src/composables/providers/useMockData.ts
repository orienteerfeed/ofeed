import { ref, computed, watch, type Ref } from 'vue'

import { createTestCategories, testCompetition } from '@/utils/testData'
import type { Competition, CompetitionList } from '@/types/competition'
import type { Category } from '@/types/category'

type QueryStatus = 'success' | 'loading' | 'error'

export const DEFAULT_TEST_COMPETITION: Competition = {
  ...testCompetition,
  categories: createTestCategories(),
}

export function useMockData({
  MOCK_COMPETION_LIST,
}: { MOCK_COMPETION_LIST?: CompetitionList } = {}) {
  const key = 'test' as const

  const getCompetitionsLoader = () => {
    const competitions = computed(
      () => MOCK_COMPETION_LIST ?? [DEFAULT_TEST_COMPETITION]
    )
    const status = ref<QueryStatus>('success')

    return { competitions, status }
  }

  const getCompetitionLoader = (competitionId: Ref<string>) => {
    const competitionObject: Competition = {
      ...DEFAULT_TEST_COMPETITION,
      id: competitionId.value,
    }
    const competition = computed(() =>
      competitionId.value ? competitionObject : undefined
    )

    const status = ref<QueryStatus>('success')

    return { competition, status }
  }

  const getAthletesLoader = ({
    competition,
    category,
    fetchEnabled,
  }: {
    competition: Competition
    category: Category
    fetchEnabled: Ref<boolean>
  }) => {
    const firstFetch = ref(fetchEnabled.value)

    if (!firstFetch.value) {
      const unwatch = watch(fetchEnabled, (isEnabled) => {
        if (isEnabled) {
          firstFetch.value = true
          unwatch()
        }
      })
    }

    const rawAthletes = computed(() =>
      firstFetch.value ? category.athletes : []
    )

    const status = computed<QueryStatus>(() =>
      firstFetch.value ? 'success' : 'loading'
    )

    return { status, rawAthletes }
  }

  return {
    key,
    getCompetitionsLoader,
    getCompetitionLoader,
    getAthletesLoader,
  }
}
