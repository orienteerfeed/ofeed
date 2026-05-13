import { defineComponent, ref } from 'vue'
import { render, waitFor } from '@testing-library/vue'
import { QueryClient, VUE_QUERY_CLIENT } from '@tanstack/vue-query'

import { getGraphQLWsUrl, useOfeed } from '../useOfeed'
import { testBasicCompetition, testCompetition } from '@/utils/testData'
import type { Competition, CompetitionList } from '@/types/competition'
import { AthleteStatus } from '@/types/category'

type WsSink = {
  next: (value: { data: Record<string, unknown> }) => void
  error: (err: unknown) => void
  complete: () => void
}

let capturedSink: WsSink | null = null

vi.mock('graphql-ws', () => ({
  createClient: () => ({
    subscribe(_query: unknown, sink: WsSink) {
      capturedSink = sink
      return () => {
        capturedSink = null
      }
    },
  }),
}))

const TEST_RESP_COMPETITIONS = {
  results: {
    data: [
      {
        ...testBasicCompetition,
        location: 'TEST LOCATION',
        relay: false,
        published: true,
      },
      {
        ...testBasicCompetition,
        id: '2',
        name: 'TEST EVENT 2',
        date: new Date('2023-01-02').toISOString(),
        location: 'TEST LOCATION 2',
        relay: false,
        published: true,
      },
    ],
  },
}

const TEST_RESP_COMPETITION = {
  results: {
    data: {
      ...testBasicCompetition,
      location: 'TEST LOCATION',
      relay: false,
      published: true,
      zeroTime: new Date('2023-01-01T10:00:00.000Z').toISOString(),
      classes: [
        {
          id: '1',
          name: 'H21',
          length: 12.3,
          climb: 320,
          controlsCount: 25,
          competitorsCount: 42,
          sex: 'M',
        },
      ],
    },
  },
}

const TEST_COMPETITIONS_PARSED: CompetitionList = [
  {
    ...testBasicCompetition,
  },
]

const TEST_COMPETITION: Competition = {
  ...testCompetition,
  categories: [
    {
      id: '1',
      name: 'H21',
      gender: 'M',
    },
  ],
}

const TEST_RESP_ATHLETES = {
  results: {
    data: {
      classes: [
        {
          competitors: [
            {
              id: 1,
              lastname: 'Doe',
              firstname: 'Jane',
              organisation: 'OK Club',
              shortName: 'OKC',
              registration: 'x',
              card: 81234567,
              startTime: '2023-01-01T10:00:00.000Z',
              finishTime: '2023-01-01T10:42:00.000Z',
              time: 2520,
              status: 'Finished',
            },
          ],
        },
      ],
    },
  },
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

function mockFetchOnce(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    } satisfies Partial<Response>)
  )
}

type UseOfeed = ReturnType<typeof useOfeed>

let competitionsComposable: ReturnType<UseOfeed['getCompetitionsLoader']>
const getTestCompetitionsComponent = () =>
  defineComponent({
    template: '<div />',
    setup() {
      const { getCompetitionsLoader } = useOfeed()
      competitionsComposable = getCompetitionsLoader()
      return { competitionsComposable }
    },
  })

let competitionComposable: ReturnType<UseOfeed['getCompetitionLoader']>
const getTestCompetitionComponent = (competitionId: string) =>
  defineComponent({
    template: '<div />',
    setup() {
      const { getCompetitionLoader } = useOfeed()
      competitionComposable = getCompetitionLoader(ref(competitionId))
      return { competitionComposable }
    },
  })

let athletesComposable: ReturnType<UseOfeed['getAthletesLoader']>
const getTestAthletesComponent = ({
  competition,
  category,
}: {
  competition: Competition
  category: Competition['categories'][number]
}) =>
  defineComponent({
    template: '<div />',
    setup() {
      const { getAthletesLoader } = useOfeed()
      athletesComposable = getAthletesLoader({
        competition,
        category,
        fetchEnabled: ref(true),
      })
      return { athletesComposable }
    },
  })

describe('useOfeed', () => {
  afterEach(() => {
    capturedSink = null
    vi.unstubAllEnvs()
  })

  it('uses the default oFeed base URL when env is not defined', async () => {
    vi.stubEnv('VITE_OFEED_API_URL', '')
    mockFetchOnce(TEST_RESP_COMPETITIONS)

    render(getTestCompetitionsComponent(), {
      global: {
        provide: {
          [VUE_QUERY_CLIENT]: createQueryClient(),
        },
      },
    })

    await waitFor(() =>
      expect(competitionsComposable.status.value).toEqual('success')
    )

    expect(fetch).toHaveBeenCalledWith('/api/ofeed/rest/v1/events')
  })

  it('uses the configured GraphQL WebSocket URL when defined', () => {
    vi.stubEnv('VITE_OFEED_GQL_WS_URL', 'wss://subscriptions.example.com/graphql')

    expect(getGraphQLWsUrl()).toEqual('wss://subscriptions.example.com/graphql')
  })

  it('normalizes a relative configured GraphQL WebSocket URL', () => {
    vi.stubEnv('VITE_OFEED_GQL_WS_URL', '/graphql')

    expect(getGraphQLWsUrl()).toEqual(`ws://${window.location.host}/graphql`)
  })

  it('derives the GraphQL WebSocket URL from an absolute OFeed API URL', () => {
    vi.stubEnv('VITE_OFEED_API_URL', 'https://api.example.com/api/ofeed')

    expect(getGraphQLWsUrl()).toEqual('wss://api.example.com/graphql')
  })

  it('returns competitions in the shared format', async () => {
    mockFetchOnce(TEST_RESP_COMPETITIONS)

    render(getTestCompetitionsComponent(), {
      global: {
        provide: {
          [VUE_QUERY_CLIENT]: createQueryClient(),
        },
      },
    })

    await waitFor(() =>
      expect(competitionsComposable.status.value).toEqual('success')
    )

    expect(competitionsComposable.competitions.value?.length).toEqual(2)
    expect(competitionsComposable.competitions.value?.[0]).toMatchObject(
      TEST_COMPETITIONS_PARSED[0]
    )
  })

  it('returns athletes in the shared format', async () => {
    render(
      getTestAthletesComponent({
        competition: TEST_COMPETITION,
        category: TEST_COMPETITION.categories[0],
      }),
      {
        global: {
          provide: {
            [VUE_QUERY_CLIENT]: createQueryClient(),
          },
        },
      }
    )

    await waitFor(() => expect(capturedSink).not.toBeNull())

    capturedSink!.next({
      data: {
        competitorsByClassUpdated: [
          {
            id: 1,
            lastname: 'Doe',
            firstname: 'Jane',
            organisation: 'OK Club',
            shortName: 'OKC',
            card: 81234567,
            startTime: '2023-01-01T10:00:00.000Z',
            finishTime: '2023-01-01T10:42:00.000Z',
            time: 2520,
            status: 'Finished',
            class: null,
          },
        ],
      },
    })

    await waitFor(() => expect(athletesComposable.status.value).toEqual('success'))

    expect(athletesComposable.rawAthletes.value).toEqual([
      {
        id: '1',
        surname: 'Doe',
        firstName: 'Jane',
        club: 'OK Club',
        clubShort: 'OKC',
        timeSeconds: 2520,
        status: AthleteStatus.Ok,
        startTime: new Date('2023-01-01T10:00:00.000Z'),
        updatedAt: new Date('2023-01-01T10:42:00.000Z'),
        card: '81234567',
      },
    ])
  })

  it.each([
    { name: 'M 16 A', sex: 'B' as const, expected: 'M' },
    { name: 'M  16 A', sex: 'B' as const, expected: 'M' },
    { name: 'M16A', sex: 'B' as const, expected: 'M' },
    { name: 'W 12 A', sex: 'B' as const, expected: 'F' },
    { name: 'W  12 A', sex: 'B' as const, expected: 'F' },
    { name: 'W12A', sex: 'B' as const, expected: 'F' },
    { name: 'H21', sex: 'B' as const, expected: 'M' },
    { name: 'D21', sex: 'B' as const, expected: 'F' },
    { name: 'Open', sex: 'B' as const, expected: 'X' },
    { name: 'Men', sex: 'B' as const, expected: 'X' },
    { name: 'Women', sex: 'B' as const, expected: 'X' },
  ])(
    'guesses gender $expected for sex=B class "$name"',
    async ({ name, sex, expected }) => {
      mockFetchOnce({
        results: {
          data: {
            ...testBasicCompetition,
            location: 'TEST LOCATION',
            relay: false,
            published: true,
            zeroTime: new Date('2023-01-01T10:00:00.000Z').toISOString(),
            classes: [{ id: '1', name, length: 0, climb: 0, controlsCount: 0, sex }],
          },
        },
      })
      render(getTestCompetitionComponent('1'), {
        global: { provide: { [VUE_QUERY_CLIENT]: createQueryClient() } },
      })
      await waitFor(() =>
        expect(competitionComposable.status.value).toEqual('success')
      )
      expect(competitionComposable.competition.value?.categories[0].gender).toEqual(
        expected
      )
    }
  )

  it('returns competition detail in the shared format', async () => {
    vi.stubEnv('VITE_OFEED_API_URL', '')
    mockFetchOnce(TEST_RESP_COMPETITION)

    render(getTestCompetitionComponent('1'), {
      global: {
        provide: {
          [VUE_QUERY_CLIENT]: createQueryClient(),
        },
      },
    })

    await waitFor(() =>
      expect(competitionComposable.status.value).toEqual('success')
    )

    expect(competitionComposable.competition.value).toMatchObject({
      ...TEST_COMPETITION,
      zeroTime: new Date('2023-01-01T10:00:00.000Z'),
    })
    expect(competitionComposable.competition.value?.categories[0]).toMatchObject({
      competitorsCount: 42,
    })
    expect(fetch).toHaveBeenCalledWith('/api/ofeed/rest/v1/events/1')
  })
})
