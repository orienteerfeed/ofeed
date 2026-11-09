import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { ref } from 'vue'
import CategoryTable from '../CategoryTable.vue'
import CategoryTableHeader from '../CategoryTableHeader.vue'
import CategoryTableUnfinishedRow from '../CategoryTableUnfinishedRow.vue'
import {
  AthleteStatus,
  type RawAthlete,
  type ResultMode,
} from '@/types/category'
import { testCompetition } from '@/utils/testData'
import { useSettingStore } from '@/stores/settings'
import { useMockData } from '@/composables/providers/useMockData'
import { useDataProviderKey } from '@/types/providers'
import { i18n } from '@/i18n/i18n'

vi.mock('@/composables/scrollColumn/useScrollColumn', () => ({
  useScrollColumnItem: () => ({
    scrollItemRef: ref(null),
    stickyRef: ref(null),
    contentRef: ref(null),
    isActive: ref(true),
  }),
}))

const athlete = (
  surname: string,
  status: AthleteStatus,
  timeSeconds = 0
): RawAthlete => ({
  id: surname,
  surname,
  firstName: 'Runner',
  club: 'Club',
  status,
  timeSeconds,
})

const renderTable = (
  resultMode: ResultMode = 'Default',
  showUnfinished = true
) => {
  const pinia = createPinia()
  useSettingStore(pinia).showUnfinishedAthletes = showUnfinished
  return mount(CategoryTable, {
    props: {
      competition: testCompetition,
      category: {
        id: '1',
        name: 'H21',
        gender: 'M',
        resultMode,
        athletes: [
          athlete('DNS', AthleteStatus.DidNotStart),
          athlete('Alpha', AthleteStatus.NotCompeting, 660),
          athlete('Zulu', AthleteStatus.NotCompeting, 600),
          athlete('Pending', AthleteStatus.NotCompeting),
          athlete('Running', AthleteStatus.Running),
        ],
      },
    },
    global: {
      plugins: [pinia, i18n],
      provide: { [useDataProviderKey as symbol]: useMockData },
      stubs: { TableHeader: true },
    },
  })
}

it('keeps completed NC results and completion counts when the start list is hidden', () => {
  const view = renderTable('Default', false)
  expect(
    view
      .findAllComponents(CategoryTableUnfinishedRow)
      .map((row) => row.props('data').id)
  ).toEqual(['Zulu', 'Alpha'])
  expect(view.text()).toContain('10:00')
  expect(view.text()).toContain('11:00')
  expect(
    view.findComponent(CategoryTableHeader).props('athletesCount')
  ).toEqual({
    finished: 3,
    unfinished: 2,
    full: 5,
  })
  view.unmount()
})

it('keeps pending athletes first and completed NC sorted by time before DNS', () => {
  const view = renderTable()
  const ids = view
    .findAllComponents(CategoryTableUnfinishedRow)
    .map((row) => row.props('data').id)
  expect(ids.slice(-3)).toEqual(['Zulu', 'Alpha', 'DNS'])
  expect(ids.slice(0, 2)).toContain('Pending')
  expect(ids.slice(0, 2)).toContain('Running')
  view.unmount()
})

it.each(['Unordered', 'UnorderedNoTimes'] as const)(
  'respects %s for completed NC results',
  async (resultMode) => {
    const view = renderTable(resultMode, false)
    expect(
      view
        .findAllComponents(CategoryTableUnfinishedRow)
        .map((row) => row.props('data').id)
    ).toEqual(['Alpha', 'Zulu'])
    if (resultMode === 'UnorderedNoTimes')
      expect(view.text()).not.toMatch(/10:00|11:00/)
    else {
      expect(view.text()).toContain('10:00')
      expect(view.text()).toContain('11:00')
    }
    await view.setProps({
      category: { ...view.props('category'), resultMode: 'Default' },
    })
    expect(
      view
        .findAllComponents(CategoryTableUnfinishedRow)
        .map((row) => row.props('data').id)
    ).toEqual(['Zulu', 'Alpha'])
    expect(view.text()).toContain('10:00')
    view.unmount()
  }
)
