import { render } from '@testing-library/vue'

import CategoryTableFinishedRow from '../CategoryTableFinishedRow.vue'
import type { AthleteWithStats } from '@/types/category'
import { AthleteStatus } from '@/types/category'

const TEST_RUNNER: AthleteWithStats = {
  id: '1',
  rank: 3,
  surname: 'Test',
  firstName: '',
  club: 'Test Club',
  status: AthleteStatus.Ok,
  time: '12:34',
  loss: '1:23',
  timeSeconds: 12 * 60 + 34,
}

describe('CategoryTableHeader', () => {
  it('renders properly', async () => {
    const { container, getByText } = render(CategoryTableFinishedRow, {
      props: { isEven: false, data: TEST_RUNNER, isCompact: false, showEmojis: true },
    })

    getByText(TEST_RUNNER.rank + '.')
    getByText(TEST_RUNNER.surname)
    getByText(TEST_RUNNER.club)
    getByText(TEST_RUNNER.time!)
    getByText('+ ' + TEST_RUNNER.loss)
    expect(container.firstChild).toHaveClass('bg-white')
    expect(container.firstChild).not.toHaveClass('bg-even')
  })

  it('renders properly for even rows', async () => {
    const { container } = render(CategoryTableFinishedRow, {
      props: { isEven: true, data: TEST_RUNNER, isCompact: false, showEmojis: true },
    })
    expect(container.firstChild).toHaveClass('bg-even')
  })

  it('renders properly for athletes with no loss', async () => {
    const athlete: AthleteWithStats = {
      ...TEST_RUNNER,
      loss: '',
    }

    const { queryByText } = render(CategoryTableFinishedRow, {
      props: { isEven: false, data: athlete, isCompact: false, showEmojis: true },
    })
    expect(queryByText('+ ' + TEST_RUNNER.loss)).toBeFalsy()
  })

  it('renders properly for not dsq athlete', async () => {
    const athlete: AthleteWithStats = {
      ...TEST_RUNNER,
      status: AthleteStatus.Disqualified,
      rank: 0,
    }

    const { getByText } = render(CategoryTableFinishedRow, {
      props: { isEven: false, data: athlete, isCompact: false, showEmojis: true },
    })
    expect(() => getByText(athlete.rank + '.')).toThrow()
    getByText('DISK')
    expect(() => getByText(athlete.time!)).toThrow()
  })

  it('renders properly for not competing athlete', async () => {
    const athlete: AthleteWithStats = {
      ...TEST_RUNNER,
      status: AthleteStatus.NotCompeting,
      time: '12:34',
      rank: 1,
    }

    const { getByText } = render(CategoryTableFinishedRow, {
      props: { isEven: false, data: athlete, isCompact: false, showEmojis: true },
    })
    expect(() => getByText(athlete.rank + '.')).toThrow()
    expect(() => getByText(AthleteStatus[athlete.status])).toThrow()
    getByText('MS')
    getByText(athlete.time!)
  })

  it('renders highlighted for recently updated athlete', async () => {
    const athlete: AthleteWithStats = {
      ...TEST_RUNNER,
      updatedAt: new Date(),
    }

    const { container, rerender } = render(CategoryTableFinishedRow, {
      props: { isEven: false, data: athlete, isCompact: false, showEmojis: true },
    })
    expect(container.firstChild).toHaveClass('bg-highlight')

    await rerender({
      isEven: false,
      data: {
        ...athlete,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    })
    expect(container.firstChild).not.toHaveClass('bg-highlight')
  })
})
