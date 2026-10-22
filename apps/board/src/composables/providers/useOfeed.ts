import { computed, ref, watchEffect, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useDebounceFn } from '@vueuse/core'
import { createClient, type Client } from 'graphql-ws'
import { boardRuntimeValue } from '@/runtime-config'

import type { Competition, CompetitionList } from '@/types/competition'
import {
  type Category,
  type RawAthlete,
  type RelayTeam,
  AthleteStatus,
  RESULT_MODES,
} from '@/types/category'

const DEFAULT_OFEED_API_URL = '/api/ofeed'
const DEFAULT_OFEED_DEV_PROXY_PATH = '/api/ofeed'
const OFEED_REST_PREFIX = '/rest/v1'

function toWebSocketGraphQLUrl(originUrl: URL): string {
  const protocol = originUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${originUrl.host}/graphql`
}

function normalizeGraphQLWsUrl(url: string): string {
  if (/^wss?:\/\//.test(url)) return url
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3001'
  const parsed = new URL(url, base)
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${parsed.host}${parsed.pathname}${parsed.search}`
}

function getGraphQLWsUrl(): string {
  const configured = boardRuntimeValue('VITE_OFEED_GQL_WS_URL')?.trim()
  if (configured) return normalizeGraphQLWsUrl(configured)
  if (typeof window !== 'undefined') {
    const apiUrl = new URL(getOfeedApiUrl(), window.location.origin)
    return toWebSocketGraphQLUrl(apiUrl)
  }
  return toWebSocketGraphQLUrl(
    new URL(getOfeedApiUrl(), 'http://localhost:3001')
  )
}

let _wsClient: Client | null = null
export function getWsClient(): Client {
  if (!_wsClient)
    _wsClient = createClient({
      url: getGraphQLWsUrl(),
      // Never give up reconnecting — a board must survive long outages.
      retryAttempts: Infinity,
      shouldRetry: () => true,
      retryWait: (retries) =>
        new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000 * 2 ** retries, 10_000))
        ),
    })
  return _wsClient
}

const RESUBSCRIBE_DELAY_MS = 5000

/**
 * Subscribes and, when the subscription fails (server-side error; transport
 * drops are retried by the client itself), subscribes again after a delay.
 * Returns a cleanup function.
 */
export function subscribeWithRetry<T>(
  payload: { query: string; variables?: Record<string, unknown> },
  next: (data: T | null | undefined) => void,
  onError?: () => void
): () => void {
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined
  const start = () => {
    unsubscribe = getWsClient().subscribe<T>(payload, {
      next: ({ data }) => next(data),
      error() {
        onError?.()
        retryTimer = setTimeout(start, RESUBSCRIBE_DELAY_MS)
      },
      complete() {},
    })
  }
  start()
  return () => {
    clearTimeout(retryTimer)
    unsubscribe?.()
  }
}

type CourseInfo = { length?: number; climb?: number; controls?: number }
// Last received data per class; survives unsubscribe/remount so the board
// keeps showing (possibly stale) results and only applies updates.
const athletesCache = new Map<
  number,
  { athletes: RawAthlete[]; courseInfo?: CourseInfo }
>()
const CLASSES_REFETCH_DEBOUNCE_MS = 2000

const CLASSES_UPDATED_SUBSCRIPTION = `
  subscription ClassesUpdated($eventId: String!) {
    classesUpdated(eventId: $eventId)
  }
`

const COMPETITORS_BY_CLASS_SUBSCRIPTION = `
  subscription CompetitorsByClassUpdated($classId: Int!) {
    competitorsByClassUpdated(classId: $classId) {
      id
      firstname
      lastname
      registration
      organisation
      shortName
      card
      startTime
      finishTime
      time
      status
      class {
        length
        climb
        controlsCount
      }
    }
  }
`

type OfeedCompetition = Pick<Competition, 'id' | 'name' | 'organizer'> & {
  date: string
  timezone?: string
  location: string
  relay: boolean
  published: boolean
}

type OfeedCategory = Pick<Category, 'id' | 'name' | 'length' | 'climb'> & {
  controlsCount: number
  competitorsCount?: number | null
  teamsCount?: number | null
  sex: 'M' | 'F' | 'B'
  resultListMode?: string | null
  awardedPlaces?: number | null
}

type OfeedCompetitionResponse = OfeedCompetition & {
  zeroTime: string
  classes?: OfeedCategory[]
}

type OfeedEnvelope<T> = {
  results?: T | { data?: T; items?: T }
}

enum OfeedAthleteStatus {
  OK = 'OK',
  Finished = 'Finished',
  MissingPunch = 'MissingPunch',
  Disqualified = 'Disqualified',
  DidNotFinish = 'DidNotFinish',
  Active = 'Active',
  Inactive = 'Inactive',
  OverTime = 'OverTime',
  SportingWithdrawal = 'SportingWithdrawal',
  NotCompeting = 'NotCompeting',
  Moved = 'Moved',
  MovedUp = 'MovedUp',
  DidNotStart = 'DidNotStart',
  DidNotEnter = 'DidNotEnter',
  Cancelled = 'Cancelled',
}

interface OfeedAthlete {
  id: number
  lastname: string
  firstname: string
  organisation: string
  shortName: string
  registration: string
  card: number
  startTime: string | null
  finishTime: string | null
  time: number | null
  status: OfeedAthleteStatus
}

type OfeedRelayAthlete = Omit<OfeedAthlete, 'organisation' | 'shortName'> & {
  leg: number
}

interface OfeedRelayTeam {
  id: number
  name: string
  organisation: string
  shortName: string
  competitors: OfeedRelayAthlete[]
  status: OfeedAthleteStatus
}

type OfeedRelayResultsResponse = OfeedEnvelope<{
  classes: Array<{ teams: OfeedRelayTeam[] }>
}>

function getOfeedApiUrl(): string {
  const configuredUrl = boardRuntimeValue('VITE_OFEED_API_URL')?.trim()
  const fallbackUrl = import.meta.env.DEV
    ? DEFAULT_OFEED_DEV_PROXY_PATH
    : DEFAULT_OFEED_API_URL
  return (configuredUrl?.length ? configuredUrl : fallbackUrl).replace(
    /\/$/,
    ''
  )
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getOfeedApiUrl()}${path}`)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapResults<T>(payload: OfeedEnvelope<T> | T): T {
  if (!isRecord(payload) || !('results' in payload)) {
    return payload as T
  }

  const { results } = payload
  if (!isRecord(results)) {
    return results as T
  }

  if ('data' in results && results.data !== undefined) {
    return results.data as T
  }

  if ('items' in results && results.items !== undefined) {
    return results.items as T
  }

  return results as T
}

type ClassEntry = {
  competitors?: OfeedAthlete[]
  teams?: OfeedRelayTeam[]
  length?: number
  climb?: number
  controlsCount?: number
}

function extractClasses(payload: unknown): Array<ClassEntry> {
  let data = payload

  if (isRecord(payload) && 'results' in payload) {
    const { results } = payload
    if (isRecord(results) && 'data' in results && results.data !== undefined) {
      data = results.data
    } else if (
      isRecord(results) &&
      'items' in results &&
      results.items !== undefined
    ) {
      data = results.items
    } else {
      data = results
    }
  }

  if (!isRecord(data) || !Array.isArray(data.classes)) {
    return []
  }

  return data.classes as Array<ClassEntry>
}

export function useOfeed() {
  const key = 'ofeed' as const

  const getCompetitionsLoader = () => {
    const { status, data: competitions } = useQuery({
      queryKey: ['competitions', key],
      queryFn: async () => {
        const json = await fetchJson<OfeedEnvelope<OfeedCompetition[]>>(
          `${OFEED_REST_PREFIX}/events`
        )
        return formatOfeedCompetitions(unwrapResults(json))
      },
    })

    return { status, competitions }
  }

  const getCompetitionLoader = (competitionId: Ref<string>) => {
    const { data: competitionData, status, refetch } = useQuery({
      queryKey: ['competitionData', key, competitionId],
      queryFn: async () => {
        const id = competitionId.value
        if (!id) {
          return undefined
        }

        const json = await fetchJson<OfeedEnvelope<OfeedCompetitionResponse>>(
          `${OFEED_REST_PREFIX}/events/${id}`
        )
        return formatOfeedCompetition(unwrapResults(json))
      },
      retry: true,
      // Fallback for missed pushes (e.g. while the socket was down).
      refetchInterval: 5 * 60 * 1000,
    })

    // Class settings edited in OFeed apply almost immediately; bursts (e.g. imports)
    // collapse into one refetch.
    const refetchDebounced = useDebounceFn(() => void refetch(), CLASSES_REFETCH_DEBOUNCE_MS)
    watchEffect((onCleanup) => {
      const eventId = competitionId.value
      if (!eventId) return
      onCleanup(
        subscribeWithRetry(
          { query: CLASSES_UPDATED_SUBSCRIPTION, variables: { eventId } },
          () => void refetchDebounced()
        )
      )
    })

    const competition = computed(() => competitionData.value)

    return { competition, status }
  }

  const getAthletesLoader = ({
    category,
    fetchEnabled,
  }: {
    competition: Competition
    category: Category
    fetchEnabled: Ref<boolean>
  }) => {
    const classId = parseInt(category.id, 10)
    const cached = athletesCache.get(classId)
    const status = ref<'loading' | 'success' | 'error'>(
      cached ? 'success' : 'loading'
    )
    const rawAthletes = ref<RawAthlete[] | undefined>(cached?.athletes)
    const courseInfo = ref<CourseInfo | undefined>(cached?.courseInfo)
    watchEffect((onCleanup) => {
      if (!fetchEnabled.value) return
      if (!Number.isFinite(classId)) return

      onCleanup(
        subscribeWithRetry<{
          competitorsByClassUpdated: Array<
            OfeedAthlete & {
              class?: {
                length?: number | null
                climb?: number | null
                controlsCount?: number | null
              }
            }
          >
        }>(
          { query: COMPETITORS_BY_CLASS_SUBSCRIPTION, variables: { classId } },
          (data) => {
            const competitors = data?.competitorsByClassUpdated ?? []
            rawAthletes.value = formatOfeedAthletesToRaw(competitors)
            const cls = competitors[0]?.class
            if (cls) {
              courseInfo.value = {
                length: cls.length ?? undefined,
                climb: cls.climb ?? undefined,
                controls: cls.controlsCount ?? undefined,
              }
            }
            athletesCache.set(classId, {
              athletes: rawAthletes.value,
              courseInfo: courseInfo.value,
            })
            status.value = 'success'
          },
          () => {
            // Keep showing last known data; only report error with nothing to show.
            if (!rawAthletes.value) status.value = 'error'
          }
        )
      )
    })

    return { status, rawAthletes, courseInfo }
  }

  const getRelayTeamsLoader = ({
    competition,
    category,
    fetchEnabled,
  }: {
    competition: Competition
    category: Category
    fetchEnabled: Ref<boolean>
  }) => {
    const { status, data: relayTeams } = useQuery({
      queryKey: ['relayTeams', key, competition.id, category.id],
      queryFn: async () => {
        const result = await fetchJson<OfeedRelayResultsResponse>(
          `${OFEED_REST_PREFIX}/events/${competition.id}/competitors?class=${category.id}`
        )
        return formatOfeedRelayTeams(extractClasses(result)[0]?.teams ?? [])
      },
      enabled: computed(() => fetchEnabled.value),
      retry: true,
      refetchInterval: 15 * 1000,
    })

    return { status, relayTeams }
  }

  return {
    key,
    getCompetitionsLoader,
    getCompetitionLoader,
    getAthletesLoader,
    getRelayTeamsLoader,
  }
}

function formatOfeedCompetitions(
  competitions: OfeedCompetition[]
): CompetitionList {
  return competitions.map((competition) => ({
    ...competition,
    isRelay: competition.relay,
    date: new Date(competition.date),
    timezone: competition.timezone,
  }))
}

function formatOfeedCompetition(
  response: OfeedCompetitionResponse
): Competition {
  return {
    ...response,
    date: new Date(response.date),
    zeroTime: new Date(response.zeroTime),
    isRelay: response.relay,
    categories: (response.classes ?? []).map(
      ({ resultListMode, awardedPlaces, ...category }) => ({
        ...category,
        controls: category.controlsCount,
        competitorsCount: category.competitorsCount ?? undefined,
        teamsCount: category.teamsCount ?? undefined,
        gender: transformGender(category.sex, category.name),
        // Values set in OFeed win over board settings.
        source: {
          gender: category.sex === 'B' ? undefined : category.sex,
          resultMode: RESULT_MODES.find((m) => m === resultListMode),
          awardedPlaces: awardedPlaces ?? undefined,
        },
      })
    ),
  }
}

function guessGender(className: string): Category['gender'] {
  if (/^[HM]\s*\d/.test(className)) return 'M'
  if (/^[DWF]\s*\d/.test(className)) return 'F'
  return 'X'
}

function transformGender(
  sex: OfeedCategory['sex'],
  name: string
): Category['gender'] {
  if (sex === 'B') return guessGender(name)
  return sex
}

const statusMap: Record<OfeedAthleteStatus, AthleteStatus> = {
  [OfeedAthleteStatus.OK]: AthleteStatus.Ok,
  [OfeedAthleteStatus.Finished]: AthleteStatus.Ok,
  [OfeedAthleteStatus.MissingPunch]: AthleteStatus.Mispunch,
  [OfeedAthleteStatus.Disqualified]: AthleteStatus.Disqualified,
  [OfeedAthleteStatus.DidNotFinish]: AthleteStatus.DidNotFinish,
  [OfeedAthleteStatus.Active]: AthleteStatus.Running,
  [OfeedAthleteStatus.Inactive]: AthleteStatus.NotStarted,
  [OfeedAthleteStatus.OverTime]: AthleteStatus.OverMaxTime,
  [OfeedAthleteStatus.SportingWithdrawal]: AthleteStatus.DidNotFinish,
  [OfeedAthleteStatus.NotCompeting]: AthleteStatus.NotCompeting,
  [OfeedAthleteStatus.Moved]: AthleteStatus.NotStarted,
  [OfeedAthleteStatus.MovedUp]: AthleteStatus.NotStarted,
  [OfeedAthleteStatus.DidNotStart]: AthleteStatus.DidNotStart,
  [OfeedAthleteStatus.DidNotEnter]: AthleteStatus.DidNotStart,
  [OfeedAthleteStatus.Cancelled]: AthleteStatus.DidNotFinish,
}

function formatOfeedAthletesToRaw(athletes: OfeedAthlete[]): RawAthlete[] {
  return athletes.map((athlete) => ({
    id: athlete.id.toString(),
    surname: athlete.lastname,
    firstName: athlete.firstname,
    club: athlete.organisation,
    clubShort: athlete.shortName,
    registration: athlete.registration ?? undefined,
    timeSeconds: athlete.time ?? 0,
    status: statusMap[athlete.status],
    startTime: athlete.startTime ? new Date(athlete.startTime) : undefined,
    updatedAt: athlete.finishTime ? new Date(athlete.finishTime) : undefined,
    card: athlete.card ? athlete.card.toString() : undefined,
  }))
}

function formatOfeedRelayTeams(teams: OfeedRelayTeam[]): RelayTeam[] {
  return teams.map((team) => ({
    id: team.id.toString(),
    name: team.name,
    club: team.organisation,
    athletes: team.competitors.map((athlete) => ({
      id: athlete.id.toString(),
      surname: athlete.lastname,
      firstName: athlete.firstname,
      timeSeconds: athlete.time ?? 0,
      leg: athlete.leg,
      status: statusMap[athlete.status],
      startTime: athlete.startTime ? new Date(athlete.startTime) : undefined,
      updatedAt: athlete.finishTime ? new Date(athlete.finishTime) : undefined,
    })),
    status: statusMap[team.status],
  }))
}

export { DEFAULT_OFEED_API_URL, getGraphQLWsUrl, getOfeedApiUrl }
