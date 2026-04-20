import { AthleteStatus } from '@/types/category'

export const formatStatus = (status: AthleteStatus) => {
  return STATUS_FORMAT[status]
}

const STATUS_FORMAT: Record<AthleteStatus, string> = {
  [AthleteStatus.Ok]: 'OK',
  [AthleteStatus.Mispunch]: 'DISK',
  [AthleteStatus.Disqualified]: 'DISK',
  [AthleteStatus.DidNotFinish]: 'DNF',
  [AthleteStatus.Running]: '...',
  [AthleteStatus.NotStarted]: '-',
  [AthleteStatus.OverMaxTime]: 'DISK',
  [AthleteStatus.DidNotStart]: 'DNS',
  [AthleteStatus.NotCompeting]: 'MS',
}
