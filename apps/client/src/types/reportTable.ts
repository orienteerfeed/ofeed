export type ChangelogEntry = {
  id: number;
  competitorId: number;
  competitor: {
    lastname: string;
    firstname: string;
    classId: number | null;
  };
  origin: string;
  type: string;
  previousValue: string | null;
  newValue: string | null;
  author?: {
    firstname: string;
    lastname: string;
  } | null;
  createdAt: string;
};

export type SortColumn =
  | 'id'
  | 'createdAt'
  | 'origin'
  | 'type'
  | 'competitorId'
  | 'lastname'
  | 'firstname'
  | 'previousValue'
  | 'newValue';

export type ColumnFilter = Exclude<SortColumn, 'type' | 'origin' | 'createdAt'>;
