import { computed, ref, type Ref } from 'vue'

import { useDataProvider } from './providers/useDataProvider'
import { AthleteStatus } from '@/types/category'
import type { Category, RawAthlete, AthleteWithStats } from '@/types/category'
import type { Competition } from '@/types/competition'
import { formatTimeOrienteering } from '@/utils/dateTime'

export type ClassifyAthletes = {
  finished: RawAthlete[]
  unfinished: RawAthlete[]
}

type ClassifiedFinishedAthletes = {
  pinnedRows: AthleteWithStats[]
  restRows: AthleteWithStats[]
}

export function useAthletes({
  competition,
  category,
  fetchEnabled,
}: {
  competition: Competition
  category: Category
  fetchEnabled: Ref<boolean>
}) {
  const { getAthletesLoader } = useDataProvider()
  /* Athletes can be passed with category in test table context */
  const { rawAthletes, status, courseInfo } = getAthletesLoader({
    category,
    competition,
    fetchEnabled,
  })

  const athletes = computed((): ClassifyAthletes => {
    const fetchedAthletes = rawAthletes.value as RawAthlete[] | undefined
    if (status.value !== 'success' || !fetchedAthletes)
      return { finished: [], unfinished: [] }
    return fetchedAthletes.reduce<ClassifyAthletes>(
      (athletes, athlete) => {
        if (
          athlete.status === AthleteStatus.NotStarted ||
          athlete.status === AthleteStatus.Running ||
          athlete.status === AthleteStatus.DidNotStart
        ) {
          athletes.unfinished.push(athlete)
        } else {
          athletes.finished.push(athlete)
        }
        return athletes
      },
      { finished: [], unfinished: [] } as ClassifyAthletes
    )
  })

  const areAvailable = computed(
    () =>
      athletes.value.finished.length > 0 || athletes.value.unfinished.length > 0
  )

  return { status, athletes, areAvailable, courseInfo }
}

export function useFinishedAthletes(
  athletes: Ref<ClassifyAthletes>,
  pinnedCount: Ref<number> = ref(1)
) {
  const finishedAthletes = computed(() => {
    if (!athletes.value.finished.length) return { pinnedRows: [], restRows: [] }
    const athletesCopy = [...athletes.value.finished]
    athletesCopy.sort(finishedAthleteSortFunction)
    return formatFinishedAthletes(athletesCopy, pinnedCount.value)
  })

  return finishedAthletes
}

function finishedAthleteSortFunction(a: RawAthlete, b: RawAthlete) {
  if (a.status !== b.status) return a.status - b.status
  if (a.timeSeconds !== b.timeSeconds) return a.timeSeconds - b.timeSeconds
  return 0
}

function formatFinishedAthletes(
  data: RawAthlete[],
  pinnedCount: number
): ClassifiedFinishedAthletes {
  const firstAthlete = data[0]
  if (!firstAthlete) return { pinnedRows: [], restRows: [] }
  if (firstAthlete.status !== AthleteStatus.Ok)
    return { pinnedRows: [], restRows: data }

  const leaderRow = {
    ...firstAthlete,
    rank: 1,
    time: formatTimeOrienteering(firstAthlete.timeSeconds),
    loss: '',
  }
  let compareTime = leaderRow.time
  let currentRank = leaderRow.rank
  const allRows: AthleteWithStats[] = [
    leaderRow,
    ...data.slice(1).map((athlete, index) => {
      if (athlete.status === AthleteStatus.Ok) {
        const itemTime = formatTimeOrienteering(athlete.timeSeconds)
        const isDraw = compareTime === itemTime
        if (!isDraw) {
          currentRank = index + 2
          compareTime = itemTime
        }
        return {
          ...athlete,
          rank: currentRank,
          time: itemTime,
          loss: calculateLoss(leaderRow, athlete),
        }
      }
      if (athlete.status === AthleteStatus.NotCompeting) {
        return { ...athlete, time: formatTimeOrienteering(athlete.timeSeconds) }
      }
      return athlete
    }),
  ]

  return {
    pinnedRows: allRows.slice(0, pinnedCount),
    restRows: allRows.slice(pinnedCount),
  }
}

function calculateLoss(leadItem: RawAthlete, compareItem: RawAthlete) {
  const lossSeconds = compareItem.timeSeconds - leadItem.timeSeconds
  if (lossSeconds === 0) return ''
  return formatTimeOrienteering(lossSeconds)
}

export function useUnfinishedAthletes(athletes: Ref<ClassifyAthletes>) {
  const unfinishedAthletes = computed(() => {
    if (!athletes.value.unfinished.length) return []
    const athletesCopy = [...athletes.value.unfinished]
    athletesCopy.sort(unfinishedAthleteSortFunction)
    return athletesCopy
  })

  return unfinishedAthletes
}

function unfinishedAthleteSortFunction(a: RawAthlete, b: RawAthlete) {
  const aIsDNS = a.status === AthleteStatus.DidNotStart
  const bIsDNS = b.status === AthleteStatus.DidNotStart
  if (aIsDNS !== bIsDNS) return aIsDNS ? 1 : -1
  if (a.startTime && b.startTime) return a.startTime > b.startTime ? 1 : -1
  if (a.status !== b.status) return a.status - b.status
  return a.surname < b.surname ? -1 : 1
}
