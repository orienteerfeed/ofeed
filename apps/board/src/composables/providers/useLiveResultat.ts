import { ref, computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { startOfDay } from 'date-fns'

import {
  fixEventJSONResponse,
  statusMap,
  adjustStartTimeToCET,
} from '@/utils/liveResultat'
import { AthleteStatus, type Category, type RawAthlete } from '@/types/category'
import type {
  Competition,
  CompetitionsItem,
  CompetitionList,
} from '@/types/competition'

type LSCompetition = Pick<Competition, 'name' | 'organizer' | 'timediff'> & {
  id: number
  date: string
}

interface LSAthlete {
  name: string
  club: string
  start: number
  result: string
  status: number
}

export function useLiveResultat() {
  const key = 'liveResultat' as const

  const getCompetitionsLoader = () => {
    const { status, data: competitions } = useQuery({
      queryKey: ['competitions', 'liveResultat'],
      queryFn: async () => {
        const response = await fetch(
          `https://liveresultat.orientering.se/api.php?method=getcompetitions`
        )
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        const jsonObject = await fixEventJSONResponse(response)
        return formatLSCompetitionsToRaw(
          jsonObject.competitions as LSCompetition[],
          true
        )
      },
    })

    return { status, competitions }
  }

  const getCompetitionLoader = (competitionId: Ref<string>) => {
    const { data: competitionData } = useQuery({
      queryKey: ['competitionData', 'liveResultat', competitionId.value],
      queryFn: async () => {
        if (!competitionId.value)
          return { name: 'TEST EVENT', organizer: 'TEST CLUB' } as Competition
        const response = await fetch(
          `https://liveresultat.orientering.se/api.php?method=getcompetitioninfo&comp=${competitionId.value}`
        )
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        const jsonObject = await fixEventJSONResponse(response)
        return formatLSCompetitionsToRaw(jsonObject as LSCompetition, false)
      },
    })

    const baseCompetitionLoaded = computed(
      () => competitionData.value !== undefined
    )
    const { status, data: competitionCategories } = useQuery({
      queryKey: ['competitionClasses', 'liveResultat', competitionId.value],
      queryFn: async () => {
        const response = await fetch(
          `https://liveresultat.orientering.se/api.php?method=getclasses&comp=${competitionId.value}`
        )
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        const { classes: categories } = (await response.json()) as {
          classes: Array<{ className: string }>
        }
        const formatted: Category[] = categories.map((category) => ({
          id: category.className,
          name: category.className,
          gender: guessGender(category.className),
        }))
        return formatted
      },
      enabled: baseCompetitionLoaded,
    })

    const competition = computed((): Competition | undefined => {
      if (!competitionCategories.value || !competitionData.value)
        return undefined
      return {
        ...competitionData.value,
        zeroTime: new Date(competitionData.value.date),
        categories: competitionCategories.value,
        isRelay: false,
      }
    })

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
    const lastHash = ref<string>()
    const enabled = computed(() =>
      typeof fetchEnabled === 'undefined' ? true : fetchEnabled.value
    )
    const { status, data: rawAthletes } = useQuery<RawAthlete[]>({
      queryKey: ['athletes', 'liveResultat', competition.id, category.id],
      queryFn: async () => {
        const response = await fetch(
          `https://liveresultat.orientering.se/api.php?comp=${
            competition.id
          }&method=getclassresults&unformattedTimes=true&class=${category.id}${
            lastHash.value ? `&last_hash=${lastHash.value}` : ''
          }`
        )
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        const res = (await response.json()) as
          | {
              results: LSAthlete[]
              hash: string
            }
          | { status: 'NOT MODIFIED' }
        /*
          StructuralSharing should revert to old data when NOT MODIFIED is in response
          Must return null to trigger structuralSharing
        */
        if (!('results' in res)) {
          return []
        }
        lastHash.value = res.hash
        return formatLSAthletesToRaw(res.results, competition)
      },
      structuralSharing: (
        oldData: unknown,
        newData: unknown
      ) => {
        const previousAthletes = Array.isArray(oldData)
          ? (oldData as RawAthlete[])
          : undefined
        const nextAthletes = Array.isArray(newData)
          ? (newData as RawAthlete[])
          : []
        if (!nextAthletes.length && previousAthletes?.length) {
          return previousAthletes
        }
        return nextAthletes
      },
      enabled,
      refetchInterval: 15 * 1000,
    })

    const courseInfo = computed<
      { length?: number; climb?: number; controls?: number } | undefined
    >(() => undefined)

    return { status, rawAthletes, courseInfo }
  }

  return {
    key,
    getCompetitionsLoader,
    getCompetitionLoader,
    getAthletesLoader,
  }
}

function guessGender(className: string) {
  const firstLetter = className.charAt(0)
  if (['H', 'M'].includes(firstLetter)) return 'M'
  if (['D', 'W', 'F'].includes(firstLetter)) return 'F'
  return 'X'
}

function formatLSCompetitionsToRaw(
  competition: LSCompetition | LSCompetition[],
  toArray: true
): CompetitionList
function formatLSCompetitionsToRaw(
  competition: LSCompetition | LSCompetition[],
  toArray: false
): CompetitionsItem
function formatLSCompetitionsToRaw(
  competitions: LSCompetition | LSCompetition[],
  toArray: boolean
) {
  const _competitions = Array.isArray(competitions)
    ? competitions
    : [competitions]

  const transformed: CompetitionList = _competitions.map((competition) => ({
    ...competition,
    id: competition.id.toString(),
    isRelay: false,
    // TODO merge timediff with date
    date: new Date(competition.date),
  }))
  return toArray ? transformed : transformed[0]!
}

function formatLSAthletesToRaw(
  athletes: LSAthlete[],
  competition: Competition
): RawAthlete[] {
  const todayStartTimeStamp = startOfDay(competition.date).valueOf()
  return athletes.map((athlete) => {
    const id = athlete.name + athlete.club
    const timeMS = parseFloat(athlete.result) * 10
    const timeSeconds = Math.round(timeMS / 1000)
    const status = statusMap[athlete.status] ?? AthleteStatus.NotStarted
    const startTimeMS = athlete.start * 10
    const startTime = adjustStartTimeToCET(
      todayStartTimeStamp + startTimeMS,
      competition.timediff
    )
    const finishTime = startTime + timeMS
    return {
      id,
      surname: athlete.name,
      firstName: '',
      club: athlete.club,
      timeSeconds,
      startTime: new Date(startTime),
      status,
      updatedAt: new Date(finishTime),
    }
  })
}
