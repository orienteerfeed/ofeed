import { computed } from 'vue'
import { isToday, isFuture } from 'date-fns'

import { useDataProvider } from './providers/useDataProvider'
import type { CompetitionList } from '@/types/competition'

export function useCompetitions() {
  const { getCompetitionsLoader } = useDataProvider()
  const { competitions, status } = getCompetitionsLoader()

  const competitionsByPeriod = computed(() => {
    const baseObject: {
      future: CompetitionList
      today: CompetitionList
      past: CompetitionList
    } = {
      future: [],
      today: [],
      past: [],
    }
    if (!competitions.value) return baseObject
    const classifiedByPeriods = competitions.value.reduce(
      (filtered, competition) => {
        if (isToday(competition.date)) filtered.today.push(competition)
        else if (isFuture(competition.date)) filtered.future.push(competition)
        else filtered.past.push(competition)
        return filtered
      },
      baseObject
    )
    classifiedByPeriods.future.sort((a, b) => (a.date > b.date ? 1 : -1)) // Sort futures from nearest to latest
    classifiedByPeriods.past.sort((a, b) => (a.date < b.date ? 1 : -1)) // Sort futures from nearest to latest
    return classifiedByPeriods
  })

  return { competitions, competitionsByPeriod, status }
}
