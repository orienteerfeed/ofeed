import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { ref } from 'vue'
import CategoryRelayTable from '../CategoryRelayTable.vue'
import {
  AthleteStatus,
  type RelayTeamWithStats,
  type ResultMode,
} from '@/types/category'
import { testCompetition } from '@/utils/testData'
import { useSettingStore } from '@/stores/settings'

vi.mock('@/composables/scrollColumn/useScrollColumn', () => ({
  useScrollColumnItem: () => ({
    scrollItemRef: ref(null),
    stickyRef: ref(null),
    contentRef: ref(null),
    isActive: ref(true),
  }),
}))

const team = (
  id: string,
  name: string,
  seconds: number,
  rank: number
): RelayTeamWithStats => ({
  id,
  name,
  club: 'Club',
  status: AthleteStatus.Ok,
  legsDone: 1,
  latestTotalResult: {
    status: AthleteStatus.Ok,
    timeSeconds: seconds,
    rank,
    loss: rank === 1 ? 0 : 60,
  },
  athletes: [
    {
      id,
      surname: name,
      firstName: 'Runner',
      leg: 1,
      status: AthleteStatus.Ok,
      timeSeconds: seconds,
      legResult: {
        status: AthleteStatus.Ok,
        timeSeconds: seconds,
        rank,
        loss: 0,
      },
      totalResult: {
        status: AthleteStatus.Ok,
        timeSeconds: seconds,
        rank,
        loss: 0,
      },
    },
  ],
})

vi.mock('@/composables/useRelayTeams', () => ({
  useRelayTeams: () => ({
    relayTeams: ref([team('1', 'Zulu', 600, 1), team('2', 'Alpha', 660, 2)]),
    teamCounts: ref({ full: 2, finished: 2, unfinished: 0 }),
    status: ref('success'),
    legCount: ref(1),
  }),
}))

const renderTable = (resultMode: ResultMode) => {
  const pinia = createPinia()
  useSettingStore(pinia).pinnedCount = 1
  return mount(CategoryRelayTable, {
    props: {
      competition: testCompetition,
      category: { id: '1', name: 'H21', gender: 'M', resultMode },
    },
    global: { plugins: [pinia], stubs: { TableHeader: true } },
  })
}

it('keeps ranked results, leg ranks and pinning in default mode', () => {
  const view = renderTable('Default')
  expect(view.text()).toContain('🥇')
  expect(view.text()).toContain('[1.]')
  expect(view.text()).toContain('10:00')
  expect(view.find('.sticky').text()).toContain('Zulu')
  expect(view.find('.sticky').text()).not.toContain('Alpha')
  expect(view.text().indexOf('Zulu')).toBeLessThan(view.text().indexOf('Alpha'))
  view.unmount()
})

it.each(['Unordered', 'UnorderedNoTimes'] as const)(
  'honors %s for teams and legs',
  (resultMode) => {
    const view = renderTable(resultMode)
    expect(view.text().indexOf('Alpha')).toBeLessThan(
      view.text().indexOf('Zulu')
    )
    expect(view.find('.sticky').text()).toBe('')
    expect(view.text()).toContain('✅')
    expect(view.text()).not.toMatch(/🥇|🥈|\[\d+\.\]|\+/)
    if (resultMode === 'UnorderedNoTimes')
      expect(view.text()).not.toMatch(/10:00|11:00/)
    else {
      expect(view.text()).toContain('10:00')
      expect(view.text()).toContain('11:00')
    }
    view.unmount()
  }
)
