import { ref } from 'vue'

import { useMockData } from '@/composables/providers/useMockData'
import { testCompetition } from '@/utils/testData'
import type { Competition } from '@/types/competition'

describe('useMockData', () => {
  const TestCompetition: Competition = {
    ...testCompetition,
    categories: [
      {
        id: '1',
        name: 'TEST CATEGORY',
        gender: 'X',
        athletes: [],
      },
    ],
  }

  it('should expose getCompetitionsListLoader, getCompetitionLoader and getAthletesLoader', () => {
    const { getCompetitionsLoader, getCompetitionLoader, getAthletesLoader } =
      useMockData()

    expect(getCompetitionsLoader).toBeDefined()
    expect(getCompetitionLoader).toBeDefined()
    expect(getAthletesLoader).toBeDefined()
  })

  it('getCompetitionsLoader returns test competition and status success', () => {
    const { getCompetitionsLoader } = useMockData()
    const { competitions, status } = getCompetitionsLoader()

    expect(competitions.value).toBeDefined()
    expect(competitions.value?.length).toBe(1)
    expect(competitions.value?.[0].id).toBe('1')
    expect(competitions.value?.[0].name).toBeDefined()
    expect(competitions.value?.[0].organizer).toBeDefined()
    expect(competitions.value?.[0].date).toBeDefined()
    expect(status.value).toBe('success')
  })

  it('getCompetitionLoader returns undefined if no id passed', () => {
    const { getCompetitionLoader } = useMockData()
    const { competition } = getCompetitionLoader(ref(''))

    expect(competition.value).toBeUndefined()
  })

  it('getCompetitionLoader returns test competition and status success', () => {
    const { getCompetitionLoader } = useMockData()
    const { competition, status } = getCompetitionLoader(ref('1'))

    expect(competition.value).toBeDefined()
    expect(competition.value?.id).toBe('1')
    expect(competition.value?.name).toBeDefined()
    expect(competition.value?.organizer).toBeDefined()
    expect(competition.value?.date).toBeDefined()
    expect(competition.value?.categories).toBeDefined()
    expect(status.value).toBe('success')
  })

  it('getAthletesLoader returns empty array if fetchEnabled is false', () => {
    const { getAthletesLoader } = useMockData()
    const { rawAthletes, status } = getAthletesLoader({
      competition: TestCompetition,
      category: TestCompetition.categories[0],
      fetchEnabled: ref(false),
    })

    expect(rawAthletes.value).toEqual([])
    expect(status.value).toEqual('loading')
  })

  it('getAthletesLoader returns athletes passed in category if fetchEnabled is true', () => {
    const { getAthletesLoader } = useMockData()
    const TestAthlete = {
      id: '1',
      firstName: 'Test',
      surname: 'Athlete',
      club: 'Test Club',
      timeSeconds: 60,
      status: 0,
    }
    const { rawAthletes, status } = getAthletesLoader({
      competition: TestCompetition,
      category: { ...TestCompetition.categories[0], athletes: [TestAthlete] },
      fetchEnabled: ref(true),
    })

    expect(rawAthletes.value).toEqual([TestAthlete])
    expect(status.value).toEqual('success')
  })
})
