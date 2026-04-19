import { render, fireEvent } from '@testing-library/vue'
import { createRouter, createWebHistory, type Router } from 'vue-router'

import CompetitionSublist from '../CompetitionSublist.vue'
import { routes } from '@/router'
import { testBasicCompetition } from '@/utils/testData'
import { useMockData } from '@/composables/providers/useMockData'
import { useDataProviderKey } from '@/types/providers'
import type { CompetitionList } from '@/types/competition'

const TEST_COMPETITIONS_3_ITEMS: CompetitionList = new Array(3).fill({}).map((_, i) => ({
  ...testBasicCompetition,
  id: String(i + 1),
  name: `TEST_EVENT ${i}`,
}))
const TEST_COMPETITIONS_20_ITEMS: CompetitionList = new Array(20).fill({}).map((_, i) => ({
  ...testBasicCompetition,
  id: String(i + 1),
  name: `TEST_EVENT ${i}`,
}))

let router: Router
beforeEach(async () => {
  router = createRouter({
    history: createWebHistory(),
    routes,
  })

  router.push('/')
  await router.isReady()
})

describe('CompetitionSublist', () => {
  it('should render competitions', () => {
    const { getAllByTestId, getAllByRole, getByText } = render(
      CompetitionSublist,
      {
        props: { competitions: TEST_COMPETITIONS_3_ITEMS },
        global: {
          plugins: [router],
          provide: {
            [useDataProviderKey as symbol]: useMockData,
          },
        },
        slots: {
          default: 'TEST LIST',
        },
      }
    )

    expect(getAllByTestId('competition-link')).toHaveLength(3)
    expect(getAllByRole('listitem')).toHaveLength(3)
    expect(getAllByRole('link')).toHaveLength(3)

    const firstCompetition = TEST_COMPETITIONS_3_ITEMS[0]!
    const oneEventLink = getByText(firstCompetition.name, {
      exact: false,
    })
    expect(oneEventLink).toHaveAttribute('href', '/events/test/1')

    getByText('TEST LIST')
    expect(() => getByText(/\d+. \d+. \d+/)).toThrow()
  })

  it('can show date in list item', () => {
    const { getByText, getAllByText } = render(CompetitionSublist, {
      props: { competitions: TEST_COMPETITIONS_3_ITEMS, showDate: true },
      global: {
        plugins: [router],
        provide: {
          [useDataProviderKey as symbol]: useMockData,
        },
      },
      slots: {
        default: 'TEST LIST',
      },
    })

    getByText('TEST LIST')
    getAllByText(/\(\d{1,2}\/\d{1,2}\/\d{4}\)/)
  })

  it('should render competitions with pagination', async () => {
    const { getAllByTestId, getByRole } = render(CompetitionSublist, {
      props: { competitions: TEST_COMPETITIONS_20_ITEMS, isPaginated: true },
      global: {
        plugins: [router],
        provide: {
          [useDataProviderKey as symbol]: useMockData,
        },
      },
      slots: {
        default: 'TEST LIST',
      },
    })

    expect(getAllByTestId('competition-link')).toHaveLength(5)
    const moreButton = getByRole('button', { name: 'Show more' })
    const fullButton = getByRole('button', { name: 'Show full' })

    await fireEvent.click(moreButton)
    expect(getAllByTestId('competition-link')).toHaveLength(10)

    await fireEvent.click(fullButton)
    expect(getAllByTestId('competition-link')).toHaveLength(20)

    expect(() => getByRole('button', { name: 'Show more' })).toThrow()
    expect(() => getByRole('button', { name: 'Show full' })).toThrow()
  })
})
