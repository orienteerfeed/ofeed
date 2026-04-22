import { ref, defineComponent } from 'vue'
import { render, waitFor } from '@testing-library/vue'
import { QueryClient, VUE_QUERY_CLIENT } from '@tanstack/vue-query'
import { addMinutes } from 'date-fns'

import { useLiveResultat } from '../useLiveResultat'
import { testBasicCompetition, testCompetition } from '@/utils/testData'
import type { Competition, CompetitionList } from '@/types/competition'
import { AthleteStatus } from '@/types/category'

const TEST_COMPETITION: Competition = {
  ...testCompetition,
  isRelay: false,
  timediff: -1,
  categories: [
    {
      id: '1',
      name: 'TEST CATEGORY',
      gender: 'X',
      athletes: [],
    },
  ],
}

const TEST_RESP_COMPETITIONS = {
  competitions: [
    {
      ...testBasicCompetition,
      timediff: 0,
    },
    {
      ...testBasicCompetition,
      id: '2',
      name: 'TEST EVENT 2',
      date: new Date('2023-01-02'),
      timediff: 0,
    },
    {
      ...testBasicCompetition,
      id: '3',
      name: 'TEST EVENT 3',
      date: new Date('2023-01-03'),
      timediff: 0,
    },
  ],
}

const TEST_COMPETITIONS_PARSED: CompetitionList = [
  {
    ...testBasicCompetition,
    timediff: 0,
  },
]

const TEST_RESP_ATHLETES = {
  status: 'OK',
  className: 'TEST',
  splitcontrols: [],
  results: [
    {
      place: '1',
      name: 'TestAthlete1',
      club: 'OK Club',
      result: '72000',
      status: 0,
      timeplus: '0',
      progress: 100,
      start: 0,
    },
    {
      place: '2',
      name: 'TestAthlete2',
      club: 'OK Club',
      result: '78000',
      status: 0,
      timeplus: '6000',
      progress: 100,
      start: 12000,
    },
    {
      place: '3',
      name: 'TestAthlete3',
      club: 'OK Club',
      result: '84000',
      status: 0,
      timeplus: '12000',
      progress: 100,
      start: 24000,
    },
  ],
  hash: 'testhash',
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function mockLiveResultatFetch({
  athletesResp = TEST_RESP_ATHLETES,
  competitionsResp = TEST_RESP_COMPETITIONS,
}: {
  athletesResp?: typeof TEST_RESP_ATHLETES
  competitionsResp?: typeof TEST_RESP_COMPETITIONS
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      )

      const method = url.searchParams.get('method')
      if (method === 'getcompetitions') {
        return new Response(JSON.stringify(competitionsResp), { status: 200 })
      }

      if (method === 'getclassresults') {
        return new Response(JSON.stringify(athletesResp), { status: 200 })
      }

      throw new Error(`Unhandled request: ${url}`)
    })
  )
}

type UseLiveResultat = ReturnType<typeof useLiveResultat>

let competitionsComposable: ReturnType<UseLiveResultat['getCompetitionsLoader']>
const getTestCompetitionsComponent = () =>
  defineComponent({
    template: '<div />',
    setup() {
      const { getCompetitionsLoader } = useLiveResultat()
      competitionsComposable = getCompetitionsLoader()
      return { competitionsComposable }
    },
  })

let athletesComposable: ReturnType<UseLiveResultat['getAthletesLoader']>
const getTestAthletesComponent = ({
  competition,
  category,
  fetchEnabled,
}: Parameters<UseLiveResultat['getAthletesLoader']>[0]) =>
  defineComponent({
    template: '<div />',
    setup() {
      const { getAthletesLoader } = useLiveResultat()
      athletesComposable = getAthletesLoader({
        competition,
        category,
        fetchEnabled,
      })
      return { athletesComposable }
    },
  })

describe('useLiveResultat', () => {
  it('returns competitions in common format', async () => {
    mockLiveResultatFetch()

    render(getTestCompetitionsComponent(), {
      global: {
        provide: {
          [VUE_QUERY_CLIENT]: createQueryClient(),
        },
      },
    })

    await waitFor(() => expect(competitionsComposable.status.value).toEqual('success'))
    expect(competitionsComposable.competitions.value?.length).toEqual(3)
    expect(competitionsComposable.competitions.value?.[0]).toEqual(
      TEST_COMPETITIONS_PARSED[0]
    )
  })

  it('returns athletes in common format', async () => {
    mockLiveResultatFetch()

    render(
      getTestAthletesComponent({
        competition: TEST_COMPETITION,
        category: TEST_COMPETITION.categories[0]!,
        fetchEnabled: ref(true),
      }),
      {
        global: {
          provide: {
            [VUE_QUERY_CLIENT]: createQueryClient(),
          },
        },
      }
    )

    await waitFor(() => expect(athletesComposable.status.value).toEqual('success'))
    expect(athletesComposable.rawAthletes.value?.length).toEqual(3)
    expect(athletesComposable.rawAthletes.value?.[0]).toEqual({
      id: 'TestAthlete1OK Club',
      surname: 'TestAthlete1',
      firstName: '',
      club: 'OK Club',
      timeSeconds: 12 * 60,
      startTime: new Date(testBasicCompetition.date),
      updatedAt: addMinutes(new Date(testBasicCompetition.date), 12),
      status: AthleteStatus.Ok,
    })
  })
})
