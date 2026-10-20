export type CategoryGender = 'M' | 'F' | 'X'

/**
 * - `Default` - ranked by time, with time and loss.
 * - `Unordered` - alphabetical, with time and loss, no ranks.
 * - `UnorderedNoTimes` - alphabetical, without time and loss.
 */
export type ResultMode = 'Default' | 'Unordered' | 'UnorderedNoTimes'
export const RESULT_MODES: ResultMode[] = ['Default', 'Unordered', 'UnorderedNoTimes']
export const DEFAULT_AWARDED_PLACES = 3

/** Per-class settings defined by the data source; they win over board settings. */
export type CategorySourceSettings = {
  gender?: CategoryGender
  resultMode?: ResultMode
  awardedPlaces?: number
}

export interface Category {
  id: string
  name: string
  length?: number
  climb?: number
  controls?: number
  competitorsCount?: number
  teamsCount?: number
  gender: CategoryGender
  colorOverride?: CategoryGender
  source?: CategorySourceSettings
  /** Effective values resolved from source and board settings. */
  resultMode?: ResultMode
  awardedPlaces?: number
  athletes?: RawAthlete[]
}

export enum AthleteStatus {
  Ok = 1,
  NotCompeting,
  OverMaxTime,
  DidNotFinish,
  Mispunch,
  Disqualified,
  DidNotStart,
  Running,
  NotStarted,
}
export type AthleteStatusPre = AthleteStatus.Running | AthleteStatus.NotStarted
export type AthleteStatusOk = AthleteStatus.Ok
export type AthleteStatusNok = Exclude<
  AthleteStatus,
  AthleteStatusPre | AthleteStatusOk
>

export interface RawAthlete {
  id: string
  firstName: string
  surname: string
  card?: string
  club: string
  clubShort?: string
  timeSeconds: number
  status: AthleteStatus
  startTime?: Date
  updatedAt?: Date
}

export interface AthleteWithStats extends RawAthlete {
  rank?: number
  time?: string
  loss?: string
}

export type ResultItemPre = {
  status: AthleteStatusPre
}
export type ResultItemNok = {
  timeSeconds: number
  status: AthleteStatusNok
}
export type ResultItemOk = {
  rank: number
  timeSeconds: number
  loss: number
  status: AthleteStatusOk
}
export type ResultItemOkPartial = Omit<ResultItemOk, 'rank' | 'loss'>

export const isResultItemOk = (item: ResultItem): item is ResultItemOk =>
  item.status === AthleteStatus.Ok
export const isResultItemNok = (item: ResultItem): item is ResultItemNok =>
  ![AthleteStatus.Ok, AthleteStatus.Running, AthleteStatus.NotStarted].includes(
    item.status
  )
export const isResultItemPre = (item: ResultItem): item is ResultItemPre =>
  [AthleteStatus.Running, AthleteStatus.NotStarted].includes(item.status)
export const isResultItemPartialOk = (
  item: ResultPartialItem
): item is ResultItemOkPartial => item.status === AthleteStatus.Ok

export type ResultItem = ResultItemPre | ResultItemOk | ResultItemNok
type ResultPartialItem = ResultItemPre | ResultItemOkPartial | ResultItemNok

export type RelayCategory = Omit<Category, 'athletes'> & {
  teams?: RelayTeam[]
  legs?: number
}

export type RelayAthlete = Omit<RawAthlete, 'club' | 'clubShort'> & {
  leg: number
}

export interface RelayTeam {
  id: string
  name: string
  club: string
  clubShort?: string
  athletes: RelayAthlete[]
  status: AthleteStatus
}

export interface RelayAthletePartial extends RelayAthlete {
  legResult: ResultPartialItem
  totalResult: ResultPartialItem
}

export interface RelayAthleteWithStats extends RelayAthlete {
  legResult: ResultItem
  totalResult: ResultItem
}

export interface RelayTeamWithTeamStats extends RelayTeam {
  status: AthleteStatus
  athletes: RelayAthletePartial[]
}

export interface RelayTeamWithStats extends RelayTeam {
  legsDone: number
  status: AthleteStatus
  latestTotalResult: ResultItem
  athletes: RelayAthleteWithStats[]
  updatedAt?: Date
}
