import { ref, defineComponent } from 'vue'
import { addMinutes } from 'date-fns'
import { render, waitFor } from '@testing-library/vue'

import {
  useAthletes,
  useFinishedAthletes,
  useUnfinishedAthletes,
} from '../useAthletes'
import type { ClassifyAthletes } from '../useAthletes'
import { useMockData } from '../providers/useMockData'
import { testCompetition as _testCompetition } from '@/utils/testData'
import { useDataProviderKey } from '@/types/providers'
import type { Competition } from '@/types/competition'
import { type RawAthlete, AthleteStatus } from '@/types/category'

describe('useAthletes', () => {
  const TestFinishedAthlete: RawAthlete = {
    id: '1',
    firstName: 'Test',
    surname: 'Athlete',
    club: 'Test Club',
    timeSeconds: 60 + 1,
    status: AthleteStatus.Ok,
  }

  const TestUnfinishedAthlete: RawAthlete = {
    id: '2',
    firstName: 'Test',
    surname: 'Unfinished Athlete',
    club: 'Test Club',
    timeSeconds: 0,
    status: AthleteStatus.Running,
  }

  const TestAthletes = [TestFinishedAthlete, TestUnfinishedAthlete]

  describe('useAthletes', () => {
    /*
      Test useAthletes with official useTestMocks data provider
      All other providers should adhere for same API (and optionally be tested E2E)
    */
    let result: ReturnType<typeof useAthletes>

    const testCompetition: Competition = {
      ..._testCompetition,
      categories: [{ id: '1', name: 'TestCat', gender: 'X' }],
    }

    const fetchEnabled = ref(true)

    const getTestComponent = (testAthletes: RawAthlete[]) =>
      defineComponent({
        template: '<span></span>',
        setup: () => {
          result = useAthletes({
            competition: testCompetition,
            category: {
              ...testCompetition.categories[0],
              athletes: testAthletes,
            },
            fetchEnabled,
          })
          return {}
        },
      })

    it('it should return empty fields and not available when no athletes passed', () => {
      render(getTestComponent([]), {
        global: {
          provide: {
            [useDataProviderKey as symbol]: useMockData,
          },
        },
      })

      expect(result.status.value).toEqual('success')
      expect(result.athletes.value.finished).toEqual([])
      expect(result.athletes.value.unfinished).toEqual([])
      expect(result.areAvailable.value).toEqual(false)
    })

    it('is should return empty athletes until fetch is enabled', async () => {
      fetchEnabled.value = false
      render(getTestComponent(TestAthletes), {
        global: {
          provide: {
            [useDataProviderKey as symbol]: useMockData,
          },
        },
      })

      expect(result.status.value).not.toEqual('success')
      expect(result.athletes.value.finished).toEqual([])
      expect(result.athletes.value.unfinished).toEqual([])
      expect(result.areAvailable.value).toEqual(false)

      fetchEnabled.value = true

      await waitFor(() => expect(result.status.value).toEqual('success')) // Wait for reactivity
      expect(result.athletes.value.finished).not.toEqual([])
      expect(result.athletes.value.unfinished).not.toEqual([])
      expect(result.areAvailable.value).toEqual(true)
    })

    it('should return filtered athletes', () => {
      render(getTestComponent(TestAthletes), {
        global: {
          provide: {
            [useDataProviderKey as symbol]: useMockData,
          },
        },
      })

      expect(result.status.value).toEqual('success')
      expect(result.athletes.value.finished).toEqual([TestFinishedAthlete])
      expect(result.athletes.value.unfinished).toEqual([TestUnfinishedAthlete])
      expect(result.areAvailable.value).toEqual(true)
    })

    it('should return filtered athletes of all athlete status variants', () => {
      const testAthletes = [
        {
          ...TestFinishedAthlete,
          status: AthleteStatus.Ok,
        },
        {
          ...TestFinishedAthlete,
          status: AthleteStatus.NotCompeting,
        },
        { ...TestFinishedAthlete, status: AthleteStatus.OverMaxTime },
        { ...TestFinishedAthlete, status: AthleteStatus.DidNotFinish },
        { ...TestFinishedAthlete, status: AthleteStatus.Mispunch },
        { ...TestFinishedAthlete, status: AthleteStatus.Disqualified },
        { ...TestFinishedAthlete, status: AthleteStatus.DidNotStart },
        {
          ...TestFinishedAthlete,
          status: AthleteStatus.Running,
        },
        {
          ...TestFinishedAthlete,
          status: AthleteStatus.NotStarted,
        },
      ]

      render(getTestComponent(testAthletes), {
        global: {
          provide: {
            [useDataProviderKey as symbol]: useMockData,
          },
        },
      })

      const unfinishedStatuses = [
        AthleteStatus.Running,
        AthleteStatus.NotStarted,
      ]

      expect(result.status.value).toEqual('success')
      for (const finished of result.athletes.value.finished) {
        expect(unfinishedStatuses).not.toContain(finished.status)
      }
      for (const unfinished of result.athletes.value.unfinished) {
        expect(unfinishedStatuses).toContain(unfinished.status)
      }
    })
  })

  describe('useFinishedAthletes', () => {
    it('should return empty array when no athletes', () => {
      const athletes = ref<ClassifyAthletes>({ finished: [], unfinished: [] })
      const finishedAthletes = useFinishedAthletes(athletes)
      expect(finishedAthletes.value.firstRow).toEqual(null)
      expect(finishedAthletes.value.restRows).toEqual([])
    })

    it('should return empty array when no finished athletes', () => {
      const athletes = ref<ClassifyAthletes>({
        finished: [],
        unfinished: [TestUnfinishedAthlete],
      })
      const finishedAthletes = useFinishedAthletes(athletes)
      expect(finishedAthletes.value.firstRow).toEqual(null)
      expect(finishedAthletes.value.restRows).toEqual([])
    })

    it('should return finished athletes', () => {
      const athletes = ref<ClassifyAthletes>({
        finished: [TestFinishedAthlete],
        unfinished: [TestUnfinishedAthlete],
      })
      const finishedAthletes = useFinishedAthletes(athletes)
      expect(finishedAthletes.value.firstRow).not.toEqual(null)
      expect(finishedAthletes.value.restRows).toEqual([])
    })

    it('should return finished athletes sorted by time, ranked and with calculated losses', () => {
      const athletes = ref<ClassifyAthletes>({
        finished: [
          {
            ...TestFinishedAthlete,
            id: '1',
            timeSeconds: 60 + 1,
          },
          {
            ...TestFinishedAthlete,
            id: '2',
            timeSeconds: 60 + 2,
          },
          {
            ...TestFinishedAthlete,
            id: '3',
            timeSeconds: 60 + 3,
          },
          {
            ...TestFinishedAthlete,
            id: '4',
            timeSeconds: 60 + 4,
          },
          {
            ...TestFinishedAthlete,
            id: '5',
            timeSeconds: 60 + 5,
          },
          {
            ...TestFinishedAthlete,
            id: '6',
            timeSeconds: 60 + 6,
          },
        ],
        unfinished: [TestUnfinishedAthlete],
      })
      const finishedAthletes = useFinishedAthletes(athletes)
      expect(finishedAthletes.value.firstRow).not.toEqual(null)
      expect(finishedAthletes.value.restRows.length).toEqual(
        athletes.value.finished.length - 1
      )

      expect(finishedAthletes.value.firstRow?.rank).toEqual(1)
      expect(finishedAthletes.value.firstRow?.time).toEqual('1:01')
      expect(finishedAthletes.value.firstRow?.loss).toEqual('')

      for (let i = 0; i < finishedAthletes.value.restRows.length; i++) {
        const parsedAthlete = finishedAthletes.value.restRows[i]
        expect(parsedAthlete.rank).toEqual(i + 2)
        expect(parsedAthlete.id).toEqual((i + 2).toString())
        expect(finishedAthletes.value.restRows[i].loss).toEqual(`0:0${i + 1}`)
      }
    })

    it('should sort correctly when input is unsorted', () => {
      const athletes = ref<ClassifyAthletes>({
        finished: [
          {
            ...TestFinishedAthlete,
            id: '1',
            timeSeconds: 120 + 2,
          },
          {
            ...TestFinishedAthlete,
            id: '2',
            timeSeconds: 180 + 3,
          },
          {
            ...TestFinishedAthlete,
            id: '3',
            timeSeconds: 60 + 1,
          },
        ],
        unfinished: [],
      })

      const finishedAthletes = useFinishedAthletes(athletes)
      expect(finishedAthletes.value.firstRow?.id).toEqual('3')
      expect(finishedAthletes.value.firstRow?.time).toEqual('1:01')

      for (let i = 0; i < finishedAthletes.value.restRows.length; i++) {
        expect(finishedAthletes.value.restRows[i].time).toEqual(
          `${i + 2}:0${i + 2}`
        )
      }
    })

    it('should solve draw correctly (same rank, same loss)', () => {
      const athletes = ref<ClassifyAthletes>({
        finished: [
          {
            ...TestFinishedAthlete,
            timeSeconds: 120 + 2,
            id: '1',
          },
          {
            ...TestFinishedAthlete,
            timeSeconds: 120 + 2,
            id: '2',
          },
          {
            ...TestFinishedAthlete,
            timeSeconds: 60 + 1,
            id: '3',
          },
          {
            ...TestFinishedAthlete,
            timeSeconds: 60 + 1,
            id: '4',
          },
        ],
        unfinished: [],
      })

      const finishedAthletes = useFinishedAthletes(athletes)
      expect(finishedAthletes.value.firstRow?.time).toEqual('1:01')

      const drawFirst = finishedAthletes.value.restRows[0]
      expect(drawFirst.rank).toEqual(1)
      expect(drawFirst.loss).toEqual('')
      for (let i = 1; i < finishedAthletes.value.restRows.length; i++) {
        expect(finishedAthletes.value.restRows[i].rank).toEqual(3)
        expect(finishedAthletes.value.restRows[i].loss).toEqual('1:01')
      }
    })

    it('should return not competing athletes with correct time and correctly sorted before disqualified (without time)', () => {
      const athletes = ref<ClassifyAthletes>({
        finished: [
          {
            ...TestFinishedAthlete,
            timeSeconds: 60 + 1,
            id: '3',
            status: AthleteStatus.Disqualified,
          },
          {
            ...TestFinishedAthlete,
            timeSeconds: 60 + 1,
            id: '2',
          },
          {
            ...TestFinishedAthlete,
            timeSeconds: 60 + 1,
            id: '1',
            status: AthleteStatus.NotCompeting,
          },
        ],
        unfinished: [],
      })

      const finishedAthletes = useFinishedAthletes(athletes)
      expect(finishedAthletes.value.firstRow?.id).toEqual('2')
      expect(finishedAthletes.value.firstRow?.time).toEqual('1:01')
      expect(finishedAthletes.value.firstRow?.rank).toEqual(1)
      expect(finishedAthletes.value.restRows[0].id).toEqual('1')
      expect(finishedAthletes.value.restRows[0].time).toEqual('1:01')
      expect(finishedAthletes.value.restRows[0].rank).not.toEqual(2)
      expect(finishedAthletes.value.restRows[1].id).toEqual('3')
      expect(finishedAthletes.value.restRows[1].time).toBeUndefined()
    })

    describe('useUnfinishedAthletes', () => {
      it('should return empty array when no athletes', () => {
        const athletes = ref<ClassifyAthletes>({ finished: [], unfinished: [] })
        const unfinishedAthletes = useUnfinishedAthletes(athletes)
        expect(unfinishedAthletes.value).toEqual([])
      })

      it('should return empty array when no unfinished athletes', () => {
        const athletes = ref<ClassifyAthletes>({
          finished: [TestFinishedAthlete],
          unfinished: [],
        })
        const unfinishedAthletes = useUnfinishedAthletes(athletes)
        expect(unfinishedAthletes.value).toEqual([])
      })

      it('should return athletes sorted first by startTime and then by status', () => {
        const now = new Date()
        const athletes = ref<ClassifyAthletes>({
          unfinished: [
            {
              ...TestUnfinishedAthlete,
              status: AthleteStatus.NotStarted,
              startTime: addMinutes(now, 3),
            },
            {
              ...TestUnfinishedAthlete,
              status: AthleteStatus.NotStarted,
              startTime: addMinutes(now, 2),
            },
            {
              ...TestUnfinishedAthlete,
              status: AthleteStatus.Running,
              startTime: addMinutes(now, 1),
            },
            {
              ...TestUnfinishedAthlete,
              status: AthleteStatus.Running,
              startTime: now,
            },
          ],
          finished: [],
        })
        const unfinishedAthletes = useUnfinishedAthletes(athletes)
        expect(unfinishedAthletes.value[0].status).toEqual(
          AthleteStatus.Running
        )
        expect(unfinishedAthletes.value[1].status).toEqual(
          AthleteStatus.Running
        )
        expect(unfinishedAthletes.value[2].status).toEqual(
          AthleteStatus.NotStarted
        )
        expect(unfinishedAthletes.value[3].status).toEqual(
          AthleteStatus.NotStarted
        )
      })
    })
  })
})
