import { AthleteStatus } from '@/types/category'

/**
 * LiveResultat emits unescaped quotes inside strings, e.g.
 * `"organizer": "PD "Avala" Beograd"`. Inside a string, a quote only closes it
 * when followed by `:`, `}`, `]`, end of input, or `,` + a new key/item.
 * Any other quote gets escaped.
 */
const closingQuoteLookahead = /\s*(?:[:}\]]|,\s*[{"[])/y

export const repairLiveResultatJSON = (input: string) => {
  const text = input.replaceAll('\t', '')
  const lastChar = text.trimEnd().length - 1
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '\\' && inString) {
      out += char + (text[++i] ?? '')
      continue
    }
    if (char !== '"') {
      out += char
      continue
    }
    if (!inString) {
      inString = true
      out += char
      continue
    }
    closingQuoteLookahead.lastIndex = i + 1
    const closes = i === lastChar || closingQuoteLookahead.test(text)
    if (closes) inString = false
    out += closes ? char : '\\"'
  }
  return out
}

export const fixEventJSONResponse = async (response: Response) =>
  JSON.parse(repairLiveResultatJSON(await response.text()))

export const statusMap: { [lsStatus: number]: AthleteStatus } = {
  0: AthleteStatus.Ok,
  1: AthleteStatus.DidNotStart,
  2: AthleteStatus.DidNotFinish,
  3: AthleteStatus.Mispunch,
  4: AthleteStatus.Disqualified,
  5: AthleteStatus.OverMaxTime,
  9: AthleteStatus.NotStarted,
  10: AthleteStatus.NotStarted,
  11: AthleteStatus.DidNotStart,
}

/**
 * Returns the UTC timestamp for midnight in the Europe/Stockholm timezone
 * on the same calendar date as the given UTC Date.
 * Uses noon UTC to avoid DST-transition edge cases.
 */
export function getCETMidnight(date: Date): number {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const d = date.getUTCDate()
  const noonUTC = new Date(Date.UTC(y, m, d, 12))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(noonUTC)
  const stockholmHour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '12')
  const cetOffset = stockholmHour - 12 // +1 (CET) or +2 (CEST)
  return Date.UTC(y, m, d) - cetOffset * 3_600_000
}

/**
 * Converts a timestamp from competition-local time (CET + timediff) to CET.
 */
export const adjustStartTimeToCET = (
  startTime: number,
  timeDiffHours?: number
) => {
  return startTime - (timeDiffHours ?? 0) * 3_600_000
}
