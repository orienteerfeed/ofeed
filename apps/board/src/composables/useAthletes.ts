import { computed, type Ref } from 'vue'

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
  firstRow: AthleteWithStats | null
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
          athlete.status === AthleteStatus.Running
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

export function useFinishedAthletes(athletes: Ref<ClassifyAthletes>) {
  const finishedAthletes = computed(() => {
    if (!athletes.value.finished.length) return { firstRow: null, restRows: [] }
    const athletesCopy = [...athletes.value.finished]
    athletesCopy.sort(finishedAthleteSortFunction)
    const formatted = formatFinishedAthletes(athletesCopy)
    return formatted
  })

  return finishedAthletes
}

function finishedAthleteSortFunction(a: RawAthlete, b: RawAthlete) {
  if (a.status !== b.status) return a.status - b.status
  if (a.timeSeconds !== b.timeSeconds) return a.timeSeconds - b.timeSeconds
  return 0
}

function formatFinishedAthletes(
  data: RawAthlete[]
): ClassifiedFinishedAthletes {
  const firstAthlete = data[0]
  if (!firstAthlete) {
    return { firstRow: null, restRows: [] }
  }
  if (firstAthlete.status !== AthleteStatus.Ok)
    return { firstRow: null, restRows: data } // First athlete after sort is not finished, nothing to format
  const firstRow = {
    ...firstAthlete,
    rank: 1,
    time: formatTimeOrienteering(firstAthlete.timeSeconds),
    loss: '',
  }
  let compareTime = firstRow.time
  let currentRank = firstRow.rank
  const restRows = data.slice(1).map((athlete, index) => {
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
        loss: calculateLoss(firstRow, athlete),
      }
    }
    if (athlete.status === AthleteStatus.NotCompeting) {
      const itemTime = formatTimeOrienteering(athlete.timeSeconds)
      return {
        ...athlete,
        time: itemTime,
      }
    }
    return athlete // Athlete is not finished, nothing to format
  })
  // TODO Move first place draw athletes to firstRow []
  return { firstRow, restRows }
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
  if (a.startTime && b.startTime) return a.startTime > b.startTime ? 1 : -1
  if (a.status !== b.status) return a.status - b.status
  return a.surname < b.surname ? -1 : 1
}
