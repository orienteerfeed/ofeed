import { computed, ref, type Ref } from 'vue'

import { useDataProvider } from './providers/useDataProvider'
import { AthleteStatus } from '@/types/category'
import type {
  Category,
  RawAthlete,
  AthleteWithStats,
  ResultMode,
} from '@/types/category'
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
          athlete.status === AthleteStatus.DidNotStart ||
          athlete.status === AthleteStatus.NotCompeting
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
  pinnedCount: Ref<number> = ref(1),
  resultMode: Ref<ResultMode> = ref('Default')
) {
  const finishedAthletes = computed((): ClassifiedFinishedAthletes => {
    if (!athletes.value.finished.length) return { pinnedRows: [], restRows: [] }
    const athletesCopy = [...athletes.value.finished]
    athletesCopy.sort(finishedAthleteSortFunction)
    if (resultMode.value === 'Default')
      return formatFinishedAthletes(athletesCopy, pinnedCount.value)

    // Unordered: not a ranking, so no ranks, loss or pinning, alphabetical.
    const hideTimes = resultMode.value === 'UnorderedNoTimes'
    const restRows = formatFinishedAthletes(athletesCopy, 0)
      .restRows.map((athlete) => ({
        ...athlete,
        rank: undefined,
        loss: undefined,
        ...(hideTimes && { time: undefined }),
      }))
      .sort(unorderedAthleteSortFunction)
    return { pinnedRows: [], restRows }
  })

  return finishedAthletes
}

function unorderedAthleteSortFunction(a: RawAthlete, b: RawAthlete) {
  if (a.status !== b.status) return a.status - b.status
  return (
    a.surname.localeCompare(b.surname, undefined, { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' })
  )
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
      return athlete
    }),
  ]

  const okCount = allRows.filter(a => a.status === AthleteStatus.Ok).length
  const effectivePinned = Math.min(pinnedCount, okCount)
  return {
    pinnedRows: allRows.slice(0, effectivePinned),
    restRows: allRows.slice(effectivePinned),
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

/** MS who already have a time have run; before that they are in the start list as usual. */
export function isNotCompetingFinished(athlete: RawAthlete) {
  return athlete.status === AthleteStatus.NotCompeting && athlete.timeSeconds > 0
}

// Running / not started (incl. MS yet to finish) first, finished MS, DNS last.
function unfinishedGroup(athlete: RawAthlete) {
  if (athlete.status === AthleteStatus.DidNotStart) return 2
  if (isNotCompetingFinished(athlete)) return 1
  return 0
}

function unfinishedAthleteSortFunction(a: RawAthlete, b: RawAthlete) {
  const groupDiff = unfinishedGroup(a) - unfinishedGroup(b)
  if (groupDiff) return groupDiff
  if (unfinishedGroup(a) === 1) {
    return (
      a.timeSeconds - b.timeSeconds ||
      a.surname.localeCompare(b.surname, undefined, { sensitivity: 'base' })
    )
  }
  if (a.startTime && b.startTime) return a.startTime > b.startTime ? 1 : -1
  if (a.status !== b.status) return a.status - b.status
  return a.surname < b.surname ? -1 : 1
}
