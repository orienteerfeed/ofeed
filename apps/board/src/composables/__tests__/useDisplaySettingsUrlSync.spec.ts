import { describe, expect, it } from 'vitest'

import {
  buildDisplaySettingsQuery,
  parseDisplaySettingsQuery,
  type DisplaySettingsUrlState,
} from '../useDisplaySettingsUrlSync'

const DEFAULTS: DisplaySettingsUrlState = {
  scrollType: 'page',
  readLineTimeSeconds: 0.3,
  compactMode: true,
  showEmojis: true,
  showUnfinishedAthletes: true,
  pinnedCount: 3,
  scrollColumnsCount: 1,
}

describe('useDisplaySettingsUrlSync', () => {
  it('parses query parameters into display state', () => {
    expect(
      parseDisplaySettingsQuery({
        scroll: 'continues',
        speed: '0.4',
        compact: '0',
        emojis: 'false',
        unfinished: '1',
        pinned: '5',
        cols: '2',
      })
    ).toEqual({
      scrollType: 'continues',
      readLineTimeSeconds: 0.4,
      compactMode: false,
      showEmojis: false,
      showUnfinishedAthletes: true,
      pinnedCount: 5,
      scrollColumnsCount: 2,
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
          scrollType: 'continues',
          readLineTimeSeconds: 0.4,
          compactMode: false,
          showEmojis: false,
          showUnfinishedAthletes: false,
          pinnedCount: 5,
          scrollColumnsCount: 2,
        },
        DEFAULTS
      )
    ).toEqual({
      scroll: 'continues',
      speed: '0.4',
      compact: '0',
      emojis: '0',
      unfinished: '0',
      pinned: '5',
      cols: '2',
    })
  })
})
