import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { TFunction } from 'i18next';
import { Pencil, Plus, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button, Input, TimePickerInput } from '@/components/atoms';
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
import { Label } from '@/components/ui/label';
import { toast } from '@/utils';

export const CLASS_START_SLOT_VACANCIES = gql`
  query ClassStartSlotVacancies($classId: Int!) {
    classStartSlotVacancies(classId: $classId) {
      id
      startTime
      bibNumber
    }
  }
`;

export const CLASS_COMPETITOR_START_TIMES = gql`
  query ClassCompetitorStartTimes($classId: Int!) {
    classCompetitorStartTimes(classId: $classId) {
      id
      startTime
    }
  }
`;

export const CREATE_START_SLOT_VACANCY = gql`
  mutation CreateStartSlotVacancy($input: CreateStartSlotVacancyInput!) {
    createStartSlotVacancy(input: $input) {
      id
      startTime
      bibNumber
    }
  }
`;

export const UPDATE_START_SLOT_VACANCY = gql`
  mutation UpdateStartSlotVacancy($input: UpdateStartSlotVacancyInput!) {
    updateStartSlotVacancy(input: $input) {
      id
      startTime
      bibNumber
    }
  }
`;

export const DELETE_START_SLOT_VACANCY = gql`
  mutation DeleteStartSlotVacancy($id: Int!) {
    deleteStartSlotVacancy(id: $id) {
      message
    }
  }
`;

type Vacancy = { id: number; startTime: string; bibNumber: number | null };
type VacanciesData = { classStartSlotVacancies: Vacancy[] };
type CompetitorStartTime = { id: number; startTime: string };
type CompetitorStartTimesData = {
  classCompetitorStartTimes: CompetitorStartTime[];
};
type SlotFormState = {
  editingId: number | null;
  date: string;
  time: string;
  bibNumber: string;
};

interface ClassStartTimesDialogProps {
  t: TFunction;
  classId: number | null;
  className: string;
  timezone: string;
  startWindowFrom?: string | null;
  startWindowTo?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_FORM: SlotFormState = {
  editingId: null,
  date: '',
  time: '',
  bibNumber: '',
};

function formValuesFromDate(date: Date | string, timezone: string) {
  return {
    date: formatInTimeZone(date, timezone, 'yyyy-MM-dd'),
    time: formatInTimeZone(date, timezone, 'HH:mm'),
  };
}

function inferStableInterval(items: { startTime: string }[]) {
  if (items.length < 2) return null;

  const times = items
    .map(item => new Date(item.startTime).getTime())
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (times.length < 2) return null;

  const diffs = times.slice(1).map((time, index) => time - times[index]!);
  const [firstDiff] = diffs;
  if (!firstDiff || firstDiff <= 0) return null;

  return diffs.every(diff => diff === firstDiff) ? firstDiff : null;
}

function createUtcStartTime(date: string, time: string, timezone: string) {
  const startTime = fromZonedTime(`${date}T${time}:00`, timezone);
  return Number.isNaN(startTime.getTime()) ? null : startTime;
}

export const ClassStartTimesDialog = ({
  t,
  classId,
  className,
  timezone,
  startWindowFrom,
  startWindowTo,
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
  const { data: competitorStartTimesData } = useQuery<CompetitorStartTimesData>(
    CLASS_COMPETITOR_START_TIMES,
    {
      variables: { classId: classId ?? 0 },
      skip: classId === null,
    }
  );
  const [createVacancy, { loading: creating }] = useMutation(
    CREATE_START_SLOT_VACANCY
  );
  const [updateVacancy, { loading: updating }] = useMutation(
    UPDATE_START_SLOT_VACANCY
  );
  const [deleteVacancy, { loading: deleting }] = useMutation(
    DELETE_START_SLOT_VACANCY
  );
  const [form, setForm] = useState<SlotFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const vacancies = data?.classStartSlotVacancies ?? [];
  const competitorStartTimes =
    competitorStartTimesData?.classCompetitorStartTimes ?? [];
  const isSaving = creating || updating;
  const classStableInterval = useMemo(
    () => inferStableInterval(vacancies),
    [vacancies]
  );
  const competitorStableInterval = useMemo(
    () => inferStableInterval(competitorStartTimes),
    [competitorStartTimes]
  );
  const stableInterval = classStableInterval ?? competitorStableInterval;
  const suggestedNextSlot = useMemo(() => {
    const sourceTimes = vacancies.length > 0 ? vacancies : competitorStartTimes;
    if (sourceTimes.length === 0) {
      return startWindowFrom ? new Date(startWindowFrom) : null;
    }
    if (!stableInterval) return null;

    const lastTime = Math.max(
      ...sourceTimes.map(item => new Date(item.startTime).getTime())
    );
    if (!Number.isFinite(lastTime)) return null;
    return new Date(lastTime + stableInterval);
  }, [competitorStartTimes, stableInterval, startWindowFrom, vacancies]);
  const windowFrom = startWindowFrom
    ? formValuesFromDate(startWindowFrom, timezone)
    : null;
  const windowTo = startWindowTo
    ? formValuesFromDate(startWindowTo, timezone)
    : null;

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [classId, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const applySuggestedNextSlot = () => {
    if (!suggestedNextSlot) return;
    const next = formValuesFromDate(suggestedNextSlot, timezone);
    setForm(current => ({ ...current, ...next, editingId: null }));
    setFormError(null);
  };

  const editVacancy = (vacancy: Vacancy) => {
    const values = formValuesFromDate(vacancy.startTime, timezone);
    setForm({
      editingId: vacancy.id,
      date: values.date,
      time: values.time,
      bibNumber: vacancy.bibNumber === null ? '' : String(vacancy.bibNumber),
    });
    setFormError(null);
  };

  const submitForm = async () => {
    if (!classId || isSaving) return;
    if (!form.date || !form.time) {
      setFormError(t('Pages.Event.Settings.Classes.StartTimes.Form.Required'));
      return;
    }

    const startTime = createUtcStartTime(form.date, form.time, timezone);
    if (!startTime) {
      setFormError(t('Pages.Event.Settings.Classes.StartTimes.Form.InvalidTime'));
      return;
    }

    const rawBibNumber = form.bibNumber.trim();
    const bibNumber = rawBibNumber ? Number.parseInt(rawBibNumber, 10) : null;
    if (
      rawBibNumber &&
      (bibNumber === null || !Number.isInteger(bibNumber) || bibNumber < 0)
    ) {
      setFormError(t('Pages.Event.Settings.Classes.StartTimes.Form.InvalidBib'));
      return;
    }

    try {
      if (form.editingId === null) {
        await createVacancy({
          variables: {
            input: {
              classId,
              startTime: startTime.toISOString(),
              bibNumber,
            },
          },
          refetchQueries: [
            { query: CLASS_START_SLOT_VACANCIES, variables: { classId } },
          ],
          awaitRefetchQueries: true,
        });
        toast({
          title: t('Operations.Success', { ns: 'common' }),
          description: t('Pages.Event.Settings.Classes.StartTimes.Created'),
        });
      } else {
        await updateVacancy({
          variables: {
            input: {
              id: form.editingId,
              startTime: startTime.toISOString(),
              bibNumber,
            },
          },
          refetchQueries: [
            { query: CLASS_START_SLOT_VACANCIES, variables: { classId } },
          ],
          awaitRefetchQueries: true,
        });
        toast({
          title: t('Operations.Success', { ns: 'common' }),
          description: t('Pages.Event.Settings.Classes.StartTimes.Updated'),
        });
      }
      resetForm();
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Classes.StartTimes.SaveError'),
        variant: 'error',
      });
    }
  };

  const removeVacancy = async (vacancy: Vacancy) => {
    if (!classId || deleting) return;

    try {
      await deleteVacancy({
        variables: { id: vacancy.id },
        refetchQueries: [
          { query: CLASS_START_SLOT_VACANCIES, variables: { classId } },
        ],
        awaitRefetchQueries: true,
      });
      if (form.editingId === vacancy.id) resetForm();
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Event.Settings.Classes.StartTimes.Deleted'),
      });
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Classes.StartTimes.DeleteError'),
        variant: 'error',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Event.Settings.Classes.StartTimes.Title', {
              name: className,
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_8rem]">
              <div className="space-y-2">
                <Label htmlFor="start-slot-date">
                  {t('Pages.Event.Settings.Classes.StartTimes.Form.Date')}
                </Label>
                <Input
                  id="start-slot-date"
                  type="date"
                  value={form.date}
                  min={windowFrom?.date}
                  max={windowTo?.date}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-slot-time">
                  {t('Pages.Event.Settings.Classes.StartTimes.Form.Time')}
                </Label>
                <TimePickerInput
                  id="start-slot-time"
                  value={form.time}
                  step={60}
                  min={form.date === windowFrom?.date ? windowFrom.time : undefined}
                  max={form.date === windowTo?.date ? windowTo.time : undefined}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      time: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-slot-bib">
                  {t('Pages.Event.Settings.Classes.StartTimes.Bib')}
                </Label>
                <Input
                  id="start-slot-bib"
                  type="number"
                  min={0}
                  value={form.bibNumber}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      bibNumber: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!suggestedNextSlot || isSaving}
                aria-label={t(
                  'Pages.Event.Settings.Classes.StartTimes.Form.UseNext'
                )}
                title={t(
                  'Pages.Event.Settings.Classes.StartTimes.Form.UseNext'
                )}
                onClick={applySuggestedNextSlot}
              >
                <Wand2 className="h-4 w-4" />
              </Button>
              {form.editingId !== null && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t(
                    'Pages.Event.Settings.Classes.StartTimes.Form.CancelEdit'
                  )}
                  title={t(
                    'Pages.Event.Settings.Classes.StartTimes.Form.CancelEdit'
                  )}
                  onClick={resetForm}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                className="gap-2"
                disabled={isSaving}
                onClick={() => void submitForm()}
              >
                <Plus className="h-4 w-4" />
                {form.editingId === null
                  ? t('Pages.Event.Settings.Classes.StartTimes.Form.Add')
                  : t('Pages.Event.Settings.Classes.StartTimes.Form.Update')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {stableInterval
              ? t('Pages.Event.Settings.Classes.StartTimes.Form.IntervalHint', {
                  minutes: stableInterval / 60_000,
                })
              : t('Pages.Event.Settings.Classes.StartTimes.Form.ManualHint')}
          </p>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
        </div>

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
                <TableHead className="w-28 text-right">
                  {t('Pages.Event.Settings.Classes.Columns.Actions')}
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
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={t(
                          'Pages.Event.Settings.Classes.StartTimes.Form.Edit'
                        )}
                        onClick={() => editVacancy(vacancy)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={deleting}
                        aria-label={t(
                          'Pages.Event.Settings.Classes.StartTimes.Form.Delete'
                        )}
                        onClick={() => void removeVacancy(vacancy)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};
