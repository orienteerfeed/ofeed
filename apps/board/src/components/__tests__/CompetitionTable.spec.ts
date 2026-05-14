import { render, waitFor } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { computed, ref } from 'vue'

import CompetitionTable from '../CompetitionTable.vue'
import { i18n } from '@/i18n/i18n'
import { useSettingStore } from '@/stores/settings'
import { useDataProviderKey } from '@/types/providers'
import type { Competition } from '@/types/competition'

const TEST_COMPETITION: Competition = {
  id: 'competition-1',
  name: 'TEST EVENT',
  organizer: 'TEST CLUB',
  date: new Date('2026-05-13T10:00:00.000Z'),
  zeroTime: new Date('2026-05-13T10:00:00.000Z'),
  isRelay: false,
  categories: [
    {
      id: '1',
      name: 'M21',
      gender: 'M',
      competitorsCount: 42,
    },
    {
      id: '2',
      name: 'W21',
      gender: 'F',
      competitorsCount: 37,
    },
  ],
}

function createDataProvider(competition: Competition) {
  return () => ({
    key: 'test' as const,
    getCompetitionsLoader: () => ({
      status: ref<'success'>('success'),
      competitions: computed(() => [competition]),
    }),
    getCompetitionLoader: () => ({
      status: ref<'success'>('success'),
      competition: computed(() => competition),
    }),
    getAthletesLoader: () => ({
      status: ref<'success'>('success'),
      rawAthletes: computed(() => []),
      courseInfo: computed(() => undefined),
    }),
  })
}

describe('CompetitionTable', () => {
  it('initializes category counts from competition metadata', async () => {
    const pinia = createPinia()

    render(CompetitionTable, {
      props: { competitionId: TEST_COMPETITION.id },
      global: {
        plugins: [pinia, i18n],
        provide: {
          [useDataProviderKey as symbol]: createDataProvider(TEST_COMPETITION),
        },
        stubs: {
          CompetitionHeader: true,
          ScrollColumn: { template: '<div><slot /></div>' },
          CategoryTable: true,
          CategoryRelayTable: true,
        },
      },
    })

    const settingsStore = useSettingStore()

    await waitFor(() => {
      expect(settingsStore.categoryCounts).toMatchObject({
        M21: 42,
        W21: 37,
      })
    })
  })
})
