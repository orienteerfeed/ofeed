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

export const adjustStartTimeToCET = (
  startTime: number,
  timeDiffHours?: number
) => {
  const timeDiffMilliseconds = (timeDiffHours ?? 0) * 60 * 60 * 1000
  const startTimeCET = startTime - timeDiffMilliseconds
  return startTimeCET
}
