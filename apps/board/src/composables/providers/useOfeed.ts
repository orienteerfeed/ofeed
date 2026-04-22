import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import type { Competition, CompetitionList } from '@/types/competition'
import {
  type Category,
  type RawAthlete,
  type RelayTeam,
  AthleteStatus,
} from '@/types/category'

const DEFAULT_OFEED_API_URL = '/api/ofeed'
const DEFAULT_OFEED_DEV_PROXY_PATH = '/api/ofeed'
const OFEED_REST_PREFIX = '/rest/v1'

type OfeedCompetition = Pick<Competition, 'id' | 'name' | 'organizer'> & {
  date: string
  timezone?: string
  location: string
  relay: boolean
  published: boolean
}

type OfeedCategory = Pick<Category, 'id' | 'name' | 'length' | 'climb'> & {
  controlsCount: number
  sex: 'M' | 'F' | 'B'
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

type OfeedCompetitionResultsResponse = OfeedEnvelope<{
  classes: Array<{
    length?: number
    climb?: number
    controlsCount?: number
    competitors: OfeedAthlete[]
  }>
}>

type OfeedRelayResultsResponse = OfeedEnvelope<{
  classes: Array<{ teams: OfeedRelayTeam[] }>
}>

function getOfeedApiUrl(): string {
  const configuredUrl = import.meta.env.VITE_OFEED_API_URL?.trim()
  const fallbackUrl = import.meta.env.DEV
    ? DEFAULT_OFEED_DEV_PROXY_PATH
    : DEFAULT_OFEED_API_URL
  return (configuredUrl?.length ? configuredUrl : fallbackUrl).replace(/\/$/, '')
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
    const { data: competitionData, status } = useQuery({
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
      refetchInterval: 5 * 60 * 1000,
    })

    const competition = computed(() => competitionData.value)

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
    const { status, data } = useQuery({
      queryKey: ['athletes', key, competition.id, category.id],
      queryFn: async () => {
        const result = await fetchJson<OfeedCompetitionResultsResponse>(
          `${OFEED_REST_PREFIX}/events/${competition.id}/competitors?class=${category.id}`
        )
        const classData = extractClasses(result)[0]
        return {
          athletes: formatOfeedAthletesToRaw(classData?.competitors ?? []),
          courseInfo: {
            length: classData?.length || undefined,
            climb: classData?.climb || undefined,
            controls: classData?.controlsCount || undefined,
          },
        }
      },
      enabled: computed(() => fetchEnabled.value),
      retry: true,
      refetchInterval: 15 * 1000,
    })

    const rawAthletes = computed(() => data.value?.athletes)
    const courseInfo = computed(() => data.value?.courseInfo)

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

function formatOfeedCompetition(response: OfeedCompetitionResponse): Competition {
  return {
    ...response,
    date: new Date(response.date),
    zeroTime: new Date(response.zeroTime),
    isRelay: response.relay,
    categories: (response.classes ?? []).map((category) => ({
      ...category,
      controls: category.controlsCount,
      gender: transformGender(category.sex),
    })),
  }
}

function transformGender(sex: OfeedCategory['sex']): Category['gender'] {
  if (sex === 'B') return 'X'
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

export { DEFAULT_OFEED_API_URL, getOfeedApiUrl }
