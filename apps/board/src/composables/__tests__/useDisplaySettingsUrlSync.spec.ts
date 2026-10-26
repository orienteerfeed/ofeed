import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import {
  applyCategoryEntries,
  buildDisplaySettingsQuery,
  createDisplaySettingsDefaults,
  decodeCategories,
  encodeCategories,
  parseDisplaySettingsQuery,
  useDisplaySettingsUrlSync,
} from '../useDisplaySettingsUrlSync'
import { useSettingStore, type CategoryDisplay } from '@/stores/settings'

const DEFAULTS = createDisplaySettingsDefaults()

const category = (
  name: string,
  order: number,
  extra: Partial<CategoryDisplay> = {}
): CategoryDisplay => ({
  name,
  selected: true,
  column: 1,
  order,
  colorOverride: null,
  resultModeOverride: null,
  awardedPlacesOverride: null,
  ...extra,
})

describe('useDisplaySettingsUrlSync', () => {
  it('parses query parameters into display state', () => {
    expect(
      parseDisplaySettingsQuery({
        scroll: 'page',
        speed: '0.4',
        compact: '0',
        emojis: 'false',
        unfinished: '1',
        pinned: '5',
        cols: '2',
        club: '1',
        reg: '1',
        hideEmpty: '0',
        announce: '0',
      })
    ).toEqual({
      scrollType: 'page',
      readLineTimeSeconds: 0.4,
      compactMode: false,
      showEmojis: false,
      showUnfinishedAthletes: true,
      pinnedCount: 5,
      scrollColumnsCount: 2,
      showClub: true,
      showRegistration: true,
      hideEmptyCategories: false,
      announceWinners: false,
    })
  })

  it('ignores invalid query values', () => {
    expect(
      parseDisplaySettingsQuery({
        scroll: 'invalid',
        speed: '100',
        compact: 'maybe',
        emojis: '2',
        unfinished: '',
        pinned: '-1',
        cols: '0',
        club: 'yes',
      })
    ).toEqual({})
  })

  it('builds a compact query by omitting defaults', () => {
    expect(buildDisplaySettingsQuery(DEFAULTS, DEFAULTS)).toEqual({})
  })

  it('builds query values for changed display settings', () => {
    expect(
      buildDisplaySettingsQuery(
        {
          scrollType: 'page',
          readLineTimeSeconds: 0.4,
          compactMode: false,
          showEmojis: false,
          showUnfinishedAthletes: false,
          pinnedCount: 5,
          scrollColumnsCount: 2,
          showClub: true,
          showRegistration: true,
          hideEmptyCategories: false,
          announceWinners: false,
        },
        DEFAULTS
      )
    ).toEqual({
      scroll: 'page',
      speed: '0.4',
      compact: '0',
      emojis: '0',
      unfinished: '0',
      pinned: '5',
      cols: '2',
      club: '1',
      reg: '1',
      hideEmpty: '0',
      announce: '0',
    })
  })
})

describe('category url encoding', () => {
  it('omits classes in default state', () => {
    const cats = [category('D10C', 0), category('D10F', 1)]
    expect(encodeCategories(cats, ['D10C', 'D10F'], 1)).toBeUndefined()
  })

  it('round-trips order, columns, hidden classes and overrides', () => {
    const cats = [
      category('D12C', 0, {
        column: 2,
        colorOverride: 'F',
        resultModeOverride: 'Unordered',
        awardedPlacesOverride: 5,
      }),
      category('D10C', 1, { selected: false, column: null }),
      category('H21 A,B:x', 2, { awardedPlacesOverride: 0 }),
      category('D10F', 3),
    ]
    const encoded = encodeCategories(
      cats,
      ['D10C', 'D10F', 'D12C', 'H21 A,B:x'],
      2
    )
    expect(encoded).toBe('D12C:2:F:U:5,D10C:0,H21 A%2CB%3Ax:1:::0,D10F:1')
    expect(decodeCategories(encoded!)).toEqual(
      cats.map(({ order: _order, ...rest }) => rest)
    )
  })

  it('applies url entries in url order, unknown classes keep state and go last', () => {
    const current = [
      category('D10C', 0),
      category('D10F', 1),
      category('D12C', 2),
    ]
    const result = applyCategoryEntries(
      current,
      decodeCategories('D12C:3:M,D10C:0,X99:1'),
      2
    )
    expect(result).toEqual([
      category('D12C', 0, { column: 2, colorOverride: 'M' }),
      category('D10C', 1, { selected: false, column: null }),
      category('D10F', 2),
    ])
  })

  it('ignores entries from another competition', () => {
    expect(
      applyCategoryEntries([category('D10C', 0)], decodeCategories('H21:1'), 1)
    ).toBeUndefined()
  })
})

describe('useDisplaySettingsUrlSync in a mounted app', () => {
  it('restores omitted defaults instead of leaking persisted settings into a shared link', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSettingStore()
    store.showClub = true
    store.announceWinners = false
    store.setAvailableCategories(['H21', 'D21'])
    store.categoriesDisplayRaw = [
      category('D21', 0, { selected: false, column: null }),
      category('H21', 1, { colorOverride: 'F' }),
    ]
    store.setScrollColumnsCount(2)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/?unrelated=keep#results')
    const wrapper = mount(
      defineComponent({
        setup: () => useDisplaySettingsUrlSync(),
        template: '<div />',
      }),
      { global: { plugins: [router, pinia] } }
    )
    await flushPromises()
    expect(store.showClub).toBe(false)
    expect(store.announceWinners).toBe(true)
    expect(store.scrollColumnsCount).toBe(1)
    expect(store.categoriesDisplay).toEqual([
      category('H21', 0),
      category('D21', 1),
    ])
    expect(router.currentRoute.value.fullPath).toBe('/?unrelated=keep#results')
    store.showClub = true
    await flushPromises()
    expect(router.currentRoute.value.query.club).toBe('1')
    await router.push('/?unrelated=keep#results')
    await flushPromises()
    expect(store.showClub).toBe(false)
    wrapper.unmount()
  })

  it('resets persisted category overrides when default categories arrive later', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSettingStore()
    store.categoriesDisplayRaw = [
      category('H21', 0, {
        selected: false,
        column: null,
        resultModeOverride: 'UnorderedNoTimes',
      }),
    ]
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const wrapper = mount(
      defineComponent({
        setup: () => useDisplaySettingsUrlSync(),
        template: '<div />',
      }),
      { global: { plugins: [router, pinia] } }
    )
    await flushPromises()
    store.setAvailableCategories(['H21'])
    await flushPromises()
    expect(store.categoriesDisplay).toEqual([category('H21', 0)])
    expect(router.currentRoute.value.query).toEqual({})
    wrapper.unmount()
  })

  it('applies url classes once data arrives and writes store changes back', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/?cols=2&club=1&cats=D12C:2:M,D10C:0')
    await router.isReady()

    mount(
      defineComponent({
        setup: () => useDisplaySettingsUrlSync(),
        template: '<div />',
      }),
      {
        global: { plugins: [router, pinia] },
      }
    )
    await flushPromises()
    const store = useSettingStore()
    expect(store.showClub).toBe(true)
    expect(store.scrollColumnsCount).toBe(2)
    // Classes not loaded yet: cats must survive in the URL.
    expect(router.currentRoute.value.query.cats).toBe('D12C:2:M,D10C:0')

    store.setAvailableCategories(['D10C', 'D10F', 'D12C'])
    await flushPromises()
    expect(
      store.categoriesDisplay.map((c) => [
        c.name,
        c.selected,
        c.column,
        c.colorOverride,
      ])
    ).toEqual([
      ['D12C', true, 2, 'M'],
      ['D10C', false, null, null],
      ['D10F', true, 1, null],
    ])
    expect(
      store.categoriesDisplayByColumn.map((col) => col.map((c) => c.name))
    ).toEqual([['D10F'], ['D12C']])
    expect(router.currentRoute.value.query.cats).toBe('D12C:2:M,D10C:0,D10F:1')

    store.setCategoryColorOverride(store.categoriesDisplay[2]!, 'F')
    store.showClub = false
    await nextTick()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      cols: '2',
      cats: 'D12C:2:M,D10C:0,D10F:1:F',
    })
  })
})
