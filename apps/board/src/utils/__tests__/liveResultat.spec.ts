import { describe, expect, it } from 'vitest'

import { repairLiveResultatJSON } from '../liveResultat'

describe('repairLiveResultatJSON', () => {
  it('keeps valid JSON unchanged', () => {
    const valid = '{"a": "x, y", "b": [1, "c"], "d": {"e": "f\\"g"}}'
    expect(repairLiveResultatJSON(valid)).toBe(valid)
  })

  it('escapes unescaped quotes inside string values', () => {
    const broken =
      '{ "competitions": [{"id": 40825, "name": "Banat Open", "organizer": "PD "Avala" Beograd", "date": "2026-10-11"},' +
      '{"id": 1, "name": "Club "O"", "organizer": "Kupa "Kracra", Pernik", "date": "2026-09-19"}]}'
    const parsed = JSON.parse(repairLiveResultatJSON(broken))
    expect(parsed.competitions[0].organizer).toBe('PD "Avala" Beograd')
    expect(parsed.competitions[0].date).toBe('2026-10-11')
    expect(parsed.competitions[1].name).toBe('Club "O"')
    expect(parsed.competitions[1].organizer).toBe('Kupa "Kracra", Pernik')
  })

  it('closes a string at end of input', () => {
    expect(JSON.parse(repairLiveResultatJSON('"a "b" c"  '))).toBe('a "b" c')
  })

  it('strips tabs', () => {
    expect(JSON.parse(repairLiveResultatJSON('{"a": "x\ty"}'))).toEqual({
      a: 'xy',
    })
  })
})
