import { createPinia, setActivePinia } from 'pinia'

import { useSettingStore } from '../settings'

describe('settings store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps per-class overrides when the class list changes', () => {
    const store = useSettingStore()
    store.setAvailableCategories(['D21', 'H21'])
    store.setCategoryOverride(store.categoriesDisplayRaw[1]!, { awardedPlacesOverride: 6 })

    store.setAvailableCategories(['D21', 'H21', 'H35'])

    expect(store.categoriesDisplay.map((c) => c.name)).toEqual(['D21', 'H21', 'H35'])
    expect(store.resolveCategorySettings('H21').awardedPlaces).toBe(6)
  })

  it('prefers source settings over board overrides over defaults', () => {
    const store = useSettingStore()
    store.setAvailableCategories(['D10'])
    store.setCategoryOverride(store.categoriesDisplayRaw[0]!, {
      colorOverride: 'X',
      resultModeOverride: 'Unordered',
      awardedPlacesOverride: 5,
    })

    expect(store.resolveCategorySettings('D10', { awardedPlaces: 1 })).toEqual({
      colorOverride: 'X',
      resultMode: 'Unordered',
      awardedPlaces: 1,
    })
    expect(
      store.resolveCategorySettings('D10', { gender: 'F', resultMode: 'Default' })
    ).toMatchObject({ colorOverride: 'F', resultMode: 'Default' })
    expect(store.resolveCategorySettings('unknown', {})).toEqual({
      colorOverride: undefined,
      resultMode: 'Default',
      awardedPlaces: 3,
    })
  })
})
