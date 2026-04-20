import { render } from '@testing-library/vue'

import CategoryTableHeader from '../CategoryTableHeader.vue'
import type { Category } from '@/types/category'

describe('CategoryTableHeader', () => {
  const TEST_CATEGORY: Category = {
    id: '1',
    name: 'Test Category',
    gender: 'X',
  }

  const TEST_COUNTS = {
    finished: 122,
    unfinished: 13,
    full: 135,
  }

  it('renders properly', async () => {
    const categoryWithDetails: Category = {
      ...TEST_CATEGORY,
      length: 2200,
      climb: 100,
      controls: 21,
    }

    const { getByText, rerender } = render(CategoryTableHeader, {
      props: { category: TEST_CATEGORY, athletesCount: TEST_COUNTS },
    })

    getByText(TEST_CATEGORY.name)
    getByText(`${TEST_COUNTS.finished} / ${TEST_COUNTS.full}`)
    expect(() =>
      getByText(`${categoryWithDetails.length} m`, { exact: false })
    ).toThrow()
    expect(() =>
      getByText(categoryWithDetails.controls!, { exact: false })
    ).toThrow()

    await rerender({ category: categoryWithDetails })
    getByText(`${categoryWithDetails.length} m`, { exact: false })
    getByText(categoryWithDetails.controls!, { exact: false })
  })

  it('sets element background based on category gender', async () => {
    const { container, rerender } = render(CategoryTableHeader, {
      props: { category: TEST_CATEGORY, athletesCount: TEST_COUNTS },
    })

    expect(container.firstChild).toHaveClass('bg-neutral')
    expect(container.firstChild).not.toHaveClass('bg-female')

    const womenCategory: Category = {
      ...TEST_CATEGORY,
      gender: 'F',
    }
    await rerender({ category: womenCategory })
    expect(container.firstChild).not.toHaveClass('bg-neutral')
    expect(container.firstChild).toHaveClass('bg-female')
  })
})
