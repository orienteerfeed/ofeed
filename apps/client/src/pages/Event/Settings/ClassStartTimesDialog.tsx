import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { formatInTimeZone } from 'date-fns-tz';
import { TFunction } from 'i18next';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const CLASS_START_SLOT_VACANCIES = gql`
  query ClassStartSlotVacancies($classId: Int!) {
    classStartSlotVacancies(classId: $classId) {
      id
      startTime
      bibNumber
    }
  }
`;

type Vacancy = { id: number; startTime: string; bibNumber: number | null };
type VacanciesData = { classStartSlotVacancies: Vacancy[] };

interface ClassStartTimesDialogProps {
  t: TFunction;
  classId: number | null;
  className: string;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ClassStartTimesDialog = ({
  t,
  classId,
  className,
  timezone,
  open,
  onOpenChange,
}: ClassStartTimesDialogProps) => {
  const { data, loading, error } = useQuery<VacanciesData>(
    CLASS_START_SLOT_VACANCIES,
    {
      variables: { classId: classId ?? 0 },
      skip: classId === null,
    }
  );

  const vacancies = data?.classStartSlotVacancies ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Event.Settings.Classes.StartTimes.Title', {
              name: className,
            })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('Organisms.AppDataTable.Loading', 'Načítání dat...')}
          </p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">
            {t('Pages.Event.Settings.Classes.StartTimes.LoadError')}
          </p>
        ) : vacancies.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('Pages.Event.Settings.Classes.StartTimes.Empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('Pages.Event.Settings.Classes.StartTimes.Time')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Classes.StartTimes.Bib')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vacancies.map(vacancy => (
                <TableRow key={vacancy.id}>
                  <TableCell>
                    {formatInTimeZone(
                      vacancy.startTime,
                      timezone,
                      'dd.MM.yyyy HH:mm'
                    )}
                  </TableCell>
                  <TableCell>{vacancy.bibNumber ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};
