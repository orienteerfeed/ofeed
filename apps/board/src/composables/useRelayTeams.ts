import { computed, type Ref } from 'vue'

import { useDataProvider } from './providers/useDataProvider'
import {
  type RelayCategory,
  type RelayTeamWithTeamStats,
  type RelayTeamWithStats,
  type RelayAthletePartial,
  type RelayAthleteWithStats,
  type ResultItem,
  type ResultItemOk,
  type ResultItemOkPartial,
  AthleteStatus,
  isResultItemPartialOk,
} from '@/types/category'
import type { Competition } from '@/types/competition'

export function useRelayTeams({
  competition,
  category,
  fetchEnabled,
}: {
  competition: Competition
  category: RelayCategory
  fetchEnabled: Ref<boolean>
}) {
  const { key, getRelayTeamsLoader } = useDataProvider()
  if (!getRelayTeamsLoader)
    throw new Error(`Relay loader not available for provider ${key}`)
  /* Athletes can be passed with category in test table context */
  const { relayTeams, status } = getRelayTeamsLoader({
    category,
    competition,
    fetchEnabled,
  })

  const legCount = computed(() => {
    if (
      status.value !== 'success' ||
      !relayTeams.value ||
      relayTeams.value.length === 0
    )
      return 0
    const legCounts = relayTeams.value.map((item) => item.athletes.length)
    const maxAthletesCount = Math.max(...legCounts)
    return maxAthletesCount
  })

  const relayStatusOrder = [
    AthleteStatus.NotStarted,
    AthleteStatus.Running,
    AthleteStatus.Ok,
    AthleteStatus.DidNotStart,
    AthleteStatus.OverMaxTime,
    AthleteStatus.Mispunch,
    AthleteStatus.Disqualified,
    AthleteStatus.DidNotFinish,
    AthleteStatus.NotCompeting,
  ]

  const relayTeamsWithTeamStats = computed((): RelayTeamWithTeamStats[] => {
    if (status.value !== 'success' || !relayTeams.value) return []
    return relayTeams.value.flatMap((item) => {
      if (item.athletes.length === 0) return [] // Filter out teams with no athletes
      let totalTime = 0
      let totalStatusIndex = 0
      const sortedAthletes = [...item.athletes].sort((a, b) => a.leg - b.leg)
      if (sortedAthletes.length !== legCount.value)
        totalStatusIndex = relayStatusOrder.length - 1 // Assign NotCompeting to incomplete teams

      const athletes = sortedAthletes.map((athlete, index, athletes) => {
        const legStatusIndex = relayStatusOrder.findIndex(
          (item) => item === athlete.status
        )
        if (legStatusIndex > totalStatusIndex) totalStatusIndex = legStatusIndex
        if (
          athlete.status === AthleteStatus.Running ||
          athlete.status === AthleteStatus.NotStarted
        ) {
          const previousAthlete = athletes[index - 1]
          const startTime =
            index !== 0 &&
            athlete.startTime &&
            athlete.startTime.getTime() ===
              previousAthlete?.startTime?.getTime()
              ? undefined
              : athlete.startTime // Remove duplicate start times across team
          return {
            ...athlete,
            startTime,
            legResult: {
              status: athlete.status,
            },
            totalResult: {
              status: athlete.status,
            },
          }
        }
        totalTime += athlete.timeSeconds
        return {
          ...athlete,
          legResult: {
            timeSeconds: athlete.timeSeconds,
            status: athlete.status,
          },
          totalResult: {
            timeSeconds: totalTime,
            status: relayStatusOrder[totalStatusIndex] ?? AthleteStatus.NotCompeting,
          },
        }
      })

      return [
        {
          ...item,
          status: relayStatusOrder[totalStatusIndex] ?? AthleteStatus.NotCompeting,
          athletes,
        },
      ]
    })
  })

  const getAthletesByLeg = (items: RelayTeamWithTeamStats[]) => {
    if (items.length === 0) return []
    return items.reduce(
      (legs, item) => {
        for (const athlete of item.athletes) {
          const leg = legs[athlete.leg - 1]
          if (leg) {
            leg.push(athlete)
          }
        }
        return legs
      },
      Array.from({ length: legCount.value }, (): RelayAthletePartial[] => [])
    )
  }

  const getValidTimesSorted = <
    T extends RelayAthletePartial,
    K extends 'legResult' | 'totalResult'
  >(
    items: T[],
    prop: K
  ) => {
    const times: number[] = []
    for (const item of items) {
      const resultItem = item[prop]
      if (isResultItemPartialOk(resultItem)) times.push(resultItem.timeSeconds)
    }
    return times.sort((a, b) => a - b)
  }

  const getTimesByLeg = (items: RelayAthletePartial[][]) => {
    if (items.length === 0) return []
    return items.reduce(
      (legs, legAthletes, index) => {
        const leg = legs[index]
        if (!leg) return legs
        leg.legTimes = getValidTimesSorted(legAthletes, 'legResult')
        leg.totalTimes = getValidTimesSorted(legAthletes, 'totalResult')
        return legs
      },
      Array.from(
        { length: items.length },
        (): { legTimes: number[]; totalTimes: number[] } => ({
          legTimes: [],
          totalTimes: [],
        })
      )
    )
  }

  const relayTeamsWithStats = computed((): RelayTeamWithStats[] => {
    if (relayTeamsWithTeamStats.value.length === 0) return []
    const timesByLeg = getTimesByLeg(
      getAthletesByLeg(relayTeamsWithTeamStats.value)
    )
    const leadLegTimes = timesByLeg.map((item) => item.legTimes[0])
    const leadTotalTimes = timesByLeg.map((item) => item.totalTimes[0])
    return relayTeamsWithTeamStats.value.map((item) => {
      let legsDone = 0
      const athletes = item.athletes.map(
        (athlete, index): RelayAthleteWithStats => {
          if (
            legsDone === index &&
            athlete.status !== AthleteStatus.NotStarted &&
            athlete.status !== AthleteStatus.Running
          )
            legsDone++
          const athleteLegIndex = athlete.leg - 1
          const legTimes = timesByLeg[athleteLegIndex]
          const leadLegTime = leadLegTimes[athleteLegIndex]
          const leadTotalTime = leadTotalTimes[athleteLegIndex]
          const legResult: ResultItem =
            isResultItemPartialOk(athlete.legResult) &&
            legTimes &&
            leadLegTime !== undefined
              ? getResultItem(
                  athlete.legResult,
                  legTimes.legTimes,
                  leadLegTime
                )
              : (athlete.legResult as ResultItem)
          const totalResult: ResultItem =
            isResultItemPartialOk(athlete.totalResult) &&
            legTimes &&
            leadTotalTime !== undefined
              ? getResultItem(
                  athlete.totalResult,
                  legTimes.totalTimes,
                  leadTotalTime
                )
              : (athlete.totalResult as ResultItem)
          return {
            ...athlete,
            legResult,
            totalResult,
          }
        }
      )
      return {
        ...item,
        athletes: athletes,
        legsDone,
        status:
          legsDone !== legCount.value && item.status === AthleteStatus.Ok
            ? AthleteStatus.Running
            : item.status,
        latestTotalResult: athletes.length
          ? athletes[Math.max(legsDone - 1, 0)]!.totalResult
          : { status: AthleteStatus.NotStarted },
        updatedAt: legsDone > 0 ? athletes[legsDone - 1]?.updatedAt : undefined,
      }
    })
  })

  const getResultItem = (
    partialItem: ResultItemOkPartial,
    legTimes: number[],
    leadTime: number
  ): ResultItemOk => {
    const legResultTime = partialItem.timeSeconds
    const legTimeIndex = legTimes.indexOf(legResultTime)
    const legTimeLoss = calculateLoss(leadTime, legResultTime)
    return {
      ...partialItem,
      rank: legTimeIndex + 1,
      loss: legTimeLoss,
    }
  }

  const relayTeamsSorted = computed(() => {
    if (relayTeamsWithStats.value.length === 0) return []
    return [...relayTeamsWithStats.value].sort((a, b) => {
      if (a.status !== b.status)
        return relayStatusOrderMap[a.status] - relayStatusOrderMap[b.status]
      if (a.legsDone !== b.legsDone) return b.legsDone - a.legsDone
      if (
        a.latestTotalResult.status === AthleteStatus.Ok &&
        b.latestTotalResult.status === AthleteStatus.Ok &&
        a.latestTotalResult.timeSeconds !== b.latestTotalResult.timeSeconds
      )
        return a.latestTotalResult.timeSeconds - b.latestTotalResult.timeSeconds
      return a.name.localeCompare(b.name)
    })
  })

  const teamCounts = computed(() => {
    const finishedTeams = relayTeamsSorted.value.filter(
      (item) =>
        item.status !== AthleteStatus.NotStarted &&
        item.status !== AthleteStatus.Running
    )
    return {
      full: relayTeamsSorted.value.length,
      finished: finishedTeams.length,
      unfinished: relayTeamsSorted.value.length - finishedTeams.length,
    }
  })

  return { status, relayTeams: relayTeamsSorted, teamCounts, legCount }
}

const RELAY_STATUS_ORDER = [
  AthleteStatus.Ok,
  AthleteStatus.Running,
  AthleteStatus.NotStarted,
  AthleteStatus.OverMaxTime,
  AthleteStatus.NotCompeting,
  AthleteStatus.DidNotStart,
  AthleteStatus.DidNotFinish,
  AthleteStatus.Mispunch,
  AthleteStatus.Disqualified,
]
const relayStatusOrderMap = RELAY_STATUS_ORDER.reduce((map, item, index) => {
  map[item] = index
  return map
}, {} as Record<AthleteStatus, number>)

function calculateLoss(timeSecondsLead: number, timeSecondLoss: number) {
  return timeSecondLoss - timeSecondsLead
}
