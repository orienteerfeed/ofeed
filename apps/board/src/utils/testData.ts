import { AthleteStatus } from '@/types/category'
import type { Category, RawAthlete } from '@/types/category'
import type { Competition, CompetitionsItem } from '@/types/competition'

export const testBasicCompetition: CompetitionsItem = {
  id: '1',
  name: 'TEST EVENT',
  organizer: 'TEST CLUB',
  date: new Date('2023-01-01'),
  timediff: 1,
  isRelay: false,
}

export const testCompetition: Competition = {
  ...testBasicCompetition,
  zeroTime: new Date(testBasicCompetition.date),
  categories: [],
}

export const createTestCategories = (): Category[] => [
  {
    id: '1',
    name: 'H21C',
    length: 10.2,
    climb: 255,
    controls: 20,
    gender: 'M',
    athletes: createTestAthletes({ gender: 'M' }),
  },
  {
    id: '2',
    name: 'D21C',
    length: 8.2,
    climb: 150,
    controls: 16,
    gender: 'F',
    athletes: createTestAthletes({ gender: 'F' }),
  },
  {
    id: '3',
    name: 'HDR',
    length: 10.2,
    climb: 255,
    controls: 20,
    gender: 'X',
    athletes: createTestAthletes({ gender: 'M' }),
  },
  {
    id: '4',
    name: 'JKL',
    length: 10.2,
    climb: 255,
    controls: 20,
    gender: 'M',
    athletes: createTestAthletes({ gender: 'M' }),
  },
  {
    id: '5',
    name: 'MNO',
    length: 10.2,
    climb: 255,
    controls: 20,
    gender: 'M',
    athletes: createTestAthletes({ gender: 'M' }),
  },
  {
    id: '6',
    name: 'PQR',
    length: 10.2,
    climb: 255,
    controls: 20,
    gender: 'M',
    athletes: createTestAthletes({ gender: 'M' }),
  },
]

const getRandomTime = () => {
  const timeM = Math.floor(Math.random() * 35) + 35
  const timeS = Math.floor(Math.random() * 60)
  return timeM * 60 + timeS
}

export const createTestAthlete = (gender?: string): RawAthlete => ({
  id: Math.floor(Math.random() * 1000000).toString(),
  surname: 'Doe',
  firstName: gender === 'F' ? 'Jane' : 'Joe',
  card: '81234567',
  club: 'Czech republic',
  timeSeconds: getRandomTime(),
  status: AthleteStatus.Ok,
})

export const createTestAthletes = ({
  gender,
  count,
}: {
  gender?: string
  count?: number
}): RawAthlete[] => {
  const athletesCount = count || Math.floor(Math.random() * 20) + 10
  return new Array(athletesCount).fill({}).map(() => createTestAthlete(gender))
}
