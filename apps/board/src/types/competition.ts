import type { Category, RelayCategory } from '@/types/category'

interface BaseCompetition {
  id: string
  name: string
  organizer: string
  date: Date
  timediff?: number // TODO can be removed?
  zeroTime: Date
}

export type Competition =
  | (BaseCompetition & { isRelay: false; categories: Category[] })
  | (BaseCompetition & { isRelay: true; categories: RelayCategory[] })

export type CompetitionsItem = Omit<Competition, 'categories' | 'zeroTime'>
export type CompetitionList = CompetitionsItem[]
