export type RowColumns = {
  compact: boolean
  club: boolean
  registration: boolean
}

/** Grid template of an individual result row; shared so all rows of a table align. */
export function rowGridColumns({ compact, club, registration }: RowColumns) {
  return [
    '2em', // rank / status icon
    compact ? '1fr' : '3fr', // name
    registration && '5em',
    !compact && '1fr', // card
    club && (compact ? '1fr' : '3fr'),
    compact ? 'max-content' : '7em', // time / status
    compact ? '4em' : '5em', // loss / card
  ]
    .filter(Boolean)
    .join(' ')
}
