import { AthleteStatus } from '@/types/category'

export const fixEventJSONResponse = async (response: Response) => {
  const invalidJSONString = await response.text()
  const validJSONString = invalidJSONString
    .replaceAll('"O"', 'O')
    .replaceAll(/\t/g, '')
  const jsonObject = JSON.parse(validJSONString)
  return jsonObject
}

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
