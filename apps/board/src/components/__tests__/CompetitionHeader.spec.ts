import { render, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'

import CompetitionHeader from '../CompetitionHeader.vue'
import { useSettingStore } from '@/stores/settings'
import { testCompetition } from '@/utils/testData'
import type { Competition } from '@/types/competition'

describe('CompetitionHeader', () => {
  const TEST_COMPETITION: Competition = {
    ...testCompetition,
  }

  it('renders properly', () => {
    const { getByText } = render(CompetitionHeader, {
      props: { competition: TEST_COMPETITION },
      global: {
        stubs: { RouterLink: true },
        plugins: [createTestingPinia()],
      },
    })
    getByText(TEST_COMPETITION.name)
  })

  it('renders current time formatted in hh:mm:ss and updates it each second', () => {
    const { getByText } = render(CompetitionHeader, {
      props: { competition: TEST_COMPETITION },
      global: {
        stubs: { RouterLink: true },
        plugins: [createTestingPinia()],
      },
    })
    getByText(/\d{1,2}:\d{2}:\d{2}(\s?[AP]M)?/)
    // TODO Find way to check time gets updated each second
  })

  it('renders home and setting (cog-icon) button', async () => {
    const { getByRole, getByTestId } = render(CompetitionHeader, {
      props: { competition: TEST_COMPETITION },
      global: {
        stubs: { RouterLink: true },
        plugins: [createTestingPinia()],
      },
    })
    const store = useSettingStore()

    getByTestId('home-button')

    const settingsButton = getByRole('button')
    expect(settingsButton).toHaveClass('i-mdi-cog')
    await fireEvent.click(settingsButton)
    expect(store.setSettingsDisplayed).toHaveBeenCalled()
  })
})
