import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Clock, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  Button,
  Checkbox,
  Experimental,
  Input,
  Select,
} from '@/components/atoms';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/molecules';
import { AppDataTable } from '@/components/organisms';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/utils';

import { ClassStartTimesDialog } from './ClassStartTimesDialog';

export const EVENT_CLASSES = gql`
  query EventClassesSettings($eventId: String!) {
    eventClasses(eventId: $eventId) {
      id
      name
      maxNumberOfCompetitors
      competitorsCount
      minAge
      maxAge
      minTeamMembers
      maxTeamMembers
      sex
      resultListMode
      fee
      lateEntryFeeDisabled
      awardedPlaces
      startMode
    }
  }
`;

export const CLASS_UPDATE = gql`
  mutation ClassUpdate($input: UpdateClassInput!) {
    classUpdate(input: $input) {
      message
    }
  }
`;

export const LOAD_CLASS_DEFINITIONS_FROM_EXTERNAL_SYSTEM = gql`
  mutation LoadClassDefinitionsFromExternalSystem($eventId: String!) {
    loadClassDefinitionsFromExternalSystem(eventId: $eventId) {
      message
    }
  }
`;

const NONE = '__none__';

export type ClassRow = {
  id: number;
  name: string;
  maxNumberOfCompetitors: number | null;
  competitorsCount: number | null;
  minAge: number | null;
  maxAge: number | null;
  minTeamMembers: number | null;
  maxTeamMembers: number | null;
  sex: string | null;
  resultListMode: string | null;
  fee: number | null;
  lateEntryFeeDisabled: boolean;
  awardedPlaces: number | null;
  startMode: string | null;
};

type EventClassesData = { eventClasses: ClassRow[] | null };
type ClassPatch = Partial<Omit<ClassRow, 'id' | 'name'>>;

interface ClassesSettingsTabProps {
  t: TFunction;
  eventId: string;
  isRelay: boolean;
  timezone: string;
  externalSource?: 'ORIS' | 'EVENTOR' | null;
  externalEventId?: string | null;
}

function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function validateMaxCompetitors(
  value: number | null,
  competitorsCount: number | null
): string | null {
  if (value === null) return null;
  if (value < 0) return 'positive';
  if (value === 0) return null;
  if (competitorsCount !== null && value < competitorsCount)
    return 'belowCount';
  return null;
}

function validateBirthYear(year: number | null): 'tooShort' | null {
  if (year === null) return null;
  return year < 1000 ? 'tooShort' : null;
}

function toFeeOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
}

export const ClassesSettingsTab = ({
  t,
  eventId,
  isRelay,
  timezone,
  externalSource,
  externalEventId,
}: ClassesSettingsTabProps) => {
  const { data, loading, error, refetch } = useQuery<EventClassesData>(
    EVENT_CLASSES,
    {
      variables: { eventId },
    }
  );
  const [classUpdate] = useMutation(CLASS_UPDATE);
  const [loadClassDefinitions, { loading: loadingClassDefinitions }] =
    useMutation(LOAD_CLASS_DEFINITIONS_FROM_EXTERNAL_SYSTEM);

  const [rows, setRows] = useState<ClassRow[]>([]);
  const committedRowsRef = useRef<ClassRow[]>([]);
  const [startTimesClass, setStartTimesClass] = useState<ClassRow | null>(null);
  const [confirmLoadOpen, setConfirmLoadOpen] = useState(false);

  useEffect(() => {
    if (data?.eventClasses) {
      setRows(data.eventClasses);
      committedRowsRef.current = data.eventClasses;
    }
  }, [data?.eventClasses]);

  const columnCount = isRelay ? 14 : 12;
  const canLoadClassDefinitions =
    Boolean(externalSource && externalEventId) && rows.length > 0;
  const externalSourceLabel = externalSource
    ? t(
        `Pages.Event.Form.Import.Providers.${externalSource}`,
        externalSource === 'EVENTOR' ? 'Eventor' : 'ORIS'
      )
    : '';

  // Age is stored in the DB, but entered/displayed as a birth year for clarity.
  // Conversion is pinned to the current calendar year:
  //   age = refYear - birthYear  /  birthYear = refYear - age
  // Because of this inversion the "from" (earliest, oldest) birth year maps to
  // maxAge, and the "to" (latest, youngest) birth year maps to minAge — which
  // keeps the stored `minAge <= maxAge` invariant whenever `from <= to`.
  const refYear = new Date().getFullYear();
  const ageToBirthYear = (age: number | null): number | null =>
    age == null ? null : refYear - age;
  const birthYearToAge = (value: string): number | null => {
    const year = toIntOrNull(value);
    return year == null ? null : refYear - year;
  };

  const applyPatch = (source: ClassRow[], classId: number, patch: ClassPatch) =>
    source.map(row => (row.id === classId ? { ...row, ...patch } : row));

  const committedPatch = (
    classId: number,
    keys: (keyof ClassPatch)[]
  ): ClassPatch => {
    const committedRow = committedRowsRef.current.find(
      row => row.id === classId
    );
    if (!committedRow) return {};

    return Object.fromEntries(
      keys.map(key => [key, committedRow[key]])
    ) as ClassPatch;
  };

  const restoreCommitted = (classId: number, keys: (keyof ClassPatch)[]) => {
    const patch = committedPatch(classId, keys);
    setRows(current => applyPatch(current, classId, patch));
  };

  // Persist a patch for one class. Successful values become the new rollback
  // baseline; a failed request restores only the fields that request changed.
  const commit = async (classId: number, patch: ClassPatch) => {
    try {
      await classUpdate({ variables: { input: { classId, ...patch } } });
      committedRowsRef.current = applyPatch(
        committedRowsRef.current,
        classId,
        patch
      );
    } catch (mutationError) {
      restoreCommitted(classId, Object.keys(patch) as (keyof ClassPatch)[]);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Classes.SaveError'),
        variant: 'error',
      });
    }
  };

  const updateLocal = (classId: number, patch: Partial<ClassRow>) => {
    setRows(current => applyPatch(current, classId, patch));
  };

  const handleLoadClassDefinitions = async () => {
    try {
      await loadClassDefinitions({ variables: { eventId } });
      const refreshed = await refetch();
      if (refreshed.data?.eventClasses) {
        setRows(refreshed.data.eventClasses);
        committedRowsRef.current = refreshed.data.eventClasses;
      }
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Event.Settings.Classes.LoadDefinitions.Success'),
      });
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Classes.LoadDefinitions.Error'),
        variant: 'error',
      });
    }
  };

  const sexOptions = [
    { value: 'B', label: t('Sex.B', { ns: 'common' }) },
    { value: 'M', label: t('Sex.M', { ns: 'common' }) },
    { value: 'F', label: t('Sex.F', { ns: 'common' }) },
  ];

  // `null` and `Default` mean the same thing, so the select only offers the
  // explicit modes; a stored null falls back to "Default".
  const resultListModeOptions = [
    {
      value: 'Default',
      label: t('Pages.Event.Settings.Classes.ResultListMode.Default'),
    },
    {
      value: 'Unordered',
      label: t('Pages.Event.Settings.Classes.ResultListMode.Unordered'),
    },
    {
      value: 'UnorderedNoTimes',
      label: t('Pages.Event.Settings.Classes.ResultListMode.UnorderedNoTimes'),
    },
  ];

  const startModeOptions = [
    { value: NONE, label: t('Pages.Event.Settings.Classes.StartMode.Inherit') },
    {
      value: 'StartList',
      label: t('Pages.Event.Settings.Classes.StartMode.StartList'),
    },
    {
      value: 'MassStart',
      label: t('Pages.Event.Settings.Classes.StartMode.MassStart'),
    },
    {
      value: 'PursuitStart',
      label: t('Pages.Event.Settings.Classes.StartMode.PursuitStart'),
    },
    {
      value: 'WaveStart',
      label: t('Pages.Event.Settings.Classes.StartMode.WaveStart'),
    },
    {
      value: 'FreeStart',
      label: t('Pages.Event.Settings.Classes.StartMode.FreeStart'),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">
              {t('Pages.Event.Settings.Classes.Title')}
            </h2>
            <Experimental />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Pages.Event.Settings.Classes.Description')}
          </p>
        </div>
        {canLoadClassDefinitions && (
          <Button
            type="button"
            variant="outline"
            className="gap-2 self-start"
            disabled={loadingClassDefinitions}
            onClick={() => setConfirmLoadOpen(true)}
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                loadingClassDefinitions && 'animate-spin'
              )}
            />
            {t('Pages.Event.Settings.Classes.LoadDefinitions.Action', {
              provider: externalSourceLabel,
            })}
          </Button>
        )}
      </div>

      <AppDataTable<ClassRow>
        data={rows}
        isLoading={loading}
        error={error}
        columnCount={columnCount}
        emptyStateText={t('Pages.Event.Settings.Classes.Empty')}
        renderHeader={
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.Name')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.CompetitorsCount')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.MaxCompetitors')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.BirthYearFrom')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.BirthYearTo')}
              </TableHead>
              {isRelay && (
                <TableHead>
                  {t('Pages.Event.Settings.Classes.Columns.MinTeamMembers')}
                </TableHead>
              )}
              {isRelay && (
                <TableHead>
                  {t('Pages.Event.Settings.Classes.Columns.MaxTeamMembers')}
                </TableHead>
              )}
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.Sex')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.ResultListMode')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.Fee')}
              </TableHead>
              <TableHead>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help items-center underline decoration-dotted underline-offset-4">
                        {t(
                          'Pages.Event.Settings.Classes.Columns.LateEntryFeeDisabled'
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      {t(
                        'Pages.Event.Settings.Classes.LateEntryFeeDisabledTooltip'
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.StartMode')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.AwardedPlaces')}
              </TableHead>
              <TableHead>
                {t('Pages.Event.Settings.Classes.Columns.Actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        renderRow={row => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>
              <span aria-label={`${row.name} competitorsCount`}>
                {row.competitorsCount ?? 0}
              </span>
            </TableCell>

            <TableCell>
              {(() => {
                const overCapacity =
                  row.competitorsCount !== null &&
                  row.maxNumberOfCompetitors !== null &&
                  row.competitorsCount > row.maxNumberOfCompetitors;
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          type="number"
                          min={0}
                          aria-label={`${row.name} maxNumberOfCompetitors`}
                          value={row.maxNumberOfCompetitors ?? ''}
                          className={cn(
                            overCapacity &&
                              'border-orange-400 bg-orange-50 focus-visible:ring-orange-400 dark:border-orange-500 dark:bg-orange-500/10'
                          )}
                          onChange={e =>
                            updateLocal(row.id, {
                              maxNumberOfCompetitors: toIntOrNull(
                                e.target.value
                              ),
                            })
                          }
                          onBlur={e => {
                            const currentValue = toIntOrNull(e.target.value);
                            const err = validateMaxCompetitors(
                              currentValue,
                              row.competitorsCount
                            );
                            if (err) {
                              restoreCommitted(row.id, [
                                'maxNumberOfCompetitors',
                              ]);
                              toast({
                                title: t('Operations.Error', { ns: 'common' }),
                                description:
                                  err === 'belowCount'
                                    ? t(
                                        'Pages.Event.Settings.Classes.MaxCompetitorsErrorBelowCount',
                                        { count: row.competitorsCount }
                                      )
                                    : t(
                                        'Pages.Event.Settings.Classes.MaxCompetitorsErrorPositive'
                                      ),
                                variant: 'error',
                              });
                              return;
                            }
                            void commit(row.id, {
                              maxNumberOfCompetitors: currentValue,
                            });
                          }}
                        />
                      </TooltipTrigger>
                      {overCapacity && (
                        <TooltipContent side="top" sideOffset={6}>
                          {t(
                            'Pages.Event.Settings.Classes.MaxCompetitorsOverCapacityTooltip',
                            {
                              count: row.competitorsCount,
                            }
                          )}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
            </TableCell>

            {/* Birth year from (earliest/oldest) ↔ maxAge */}
            {(() => {
              const birthYearFrom = ageToBirthYear(row.maxAge);
              const birthYearTo = ageToBirthYear(row.minAge);
              const formatErr = validateBirthYear(birthYearFrom);
              const rangeErr =
                birthYearFrom !== null &&
                birthYearTo !== null &&
                birthYearFrom > birthYearTo;
              const hasError = !!formatErr || rangeErr;
              return (
                <TableCell>
                  <Input
                    type="number"
                    aria-label={`${row.name} birthYearFrom`}
                    value={birthYearFrom ?? ''}
                    className={cn(
                      hasError &&
                        'border-destructive bg-red-50 focus-visible:ring-destructive dark:bg-red-500/10'
                    )}
                    onChange={e =>
                      updateLocal(row.id, {
                        maxAge: birthYearToAge(e.target.value),
                      })
                    }
                    onBlur={e => {
                      const year = toIntOrNull(e.target.value);
                      if (validateBirthYear(year)) {
                        restoreCommitted(row.id, ['minAge', 'maxAge']);
                        toast({
                          title: t('Operations.Error', { ns: 'common' }),
                          description: t(
                            'Pages.Event.Settings.Classes.BirthYearInvalid'
                          ),
                          variant: 'error',
                        });
                        return;
                      }
                      const newMaxAge = year != null ? refYear - year : null;
                      if (
                        newMaxAge !== null &&
                        row.minAge !== null &&
                        newMaxAge < row.minAge
                      ) {
                        restoreCommitted(row.id, ['minAge', 'maxAge']);
                        toast({
                          title: t('Operations.Error', { ns: 'common' }),
                          description: t(
                            'Pages.Event.Settings.Classes.BirthYearRangeError'
                          ),
                          variant: 'error',
                        });
                        return;
                      }
                      void commit(row.id, {
                        minAge: row.minAge,
                        maxAge: newMaxAge,
                      });
                    }}
                  />
                </TableCell>
              );
            })()}

            {/* Birth year to (latest/youngest) ↔ minAge */}
            {(() => {
              const birthYearFrom = ageToBirthYear(row.maxAge);
              const birthYearTo = ageToBirthYear(row.minAge);
              const formatErr = validateBirthYear(birthYearTo);
              const rangeErr =
                birthYearFrom !== null &&
                birthYearTo !== null &&
                birthYearFrom > birthYearTo;
              const hasError = !!formatErr || rangeErr;
              return (
                <TableCell>
                  <Input
                    type="number"
                    aria-label={`${row.name} birthYearTo`}
                    value={birthYearTo ?? ''}
                    className={cn(
                      hasError &&
                        'border-destructive bg-red-50 focus-visible:ring-destructive dark:bg-red-500/10'
                    )}
                    onChange={e =>
                      updateLocal(row.id, {
                        minAge: birthYearToAge(e.target.value),
                      })
                    }
                    onBlur={e => {
                      const year = toIntOrNull(e.target.value);
                      if (validateBirthYear(year)) {
                        restoreCommitted(row.id, ['minAge', 'maxAge']);
                        toast({
                          title: t('Operations.Error', { ns: 'common' }),
                          description: t(
                            'Pages.Event.Settings.Classes.BirthYearInvalid'
                          ),
                          variant: 'error',
                        });
                        return;
                      }
                      const newMinAge = year != null ? refYear - year : null;
                      if (
                        newMinAge !== null &&
                        row.maxAge !== null &&
                        newMinAge > row.maxAge
                      ) {
                        restoreCommitted(row.id, ['minAge', 'maxAge']);
                        toast({
                          title: t('Operations.Error', { ns: 'common' }),
                          description: t(
                            'Pages.Event.Settings.Classes.BirthYearRangeError'
                          ),
                          variant: 'error',
                        });
                        return;
                      }
                      void commit(row.id, {
                        minAge: newMinAge,
                        maxAge: row.maxAge,
                      });
                    }}
                  />
                </TableCell>
              );
            })()}

            {isRelay && (
              <TableCell>
                <Input
                  type="number"
                  aria-label={`${row.name} minTeamMembers`}
                  value={row.minTeamMembers ?? ''}
                  onChange={e =>
                    updateLocal(row.id, {
                      minTeamMembers: toIntOrNull(e.target.value),
                    })
                  }
                  onBlur={() => {
                    void commit(row.id, {
                      minTeamMembers: row.minTeamMembers,
                      maxTeamMembers: row.maxTeamMembers,
                    });
                  }}
                />
              </TableCell>
            )}

            {isRelay && (
              <TableCell>
                <Input
                  type="number"
                  aria-label={`${row.name} maxTeamMembers`}
                  value={row.maxTeamMembers ?? ''}
                  onChange={e =>
                    updateLocal(row.id, {
                      maxTeamMembers: toIntOrNull(e.target.value),
                    })
                  }
                  onBlur={() => {
                    void commit(row.id, {
                      minTeamMembers: row.minTeamMembers,
                      maxTeamMembers: row.maxTeamMembers,
                    });
                  }}
                />
              </TableCell>
            )}

            <TableCell>
              <Select
                value={row.sex ?? 'B'}
                options={sexOptions}
                onValueChange={value => {
                  updateLocal(row.id, { sex: value });
                  void commit(row.id, { sex: value });
                }}
              />
            </TableCell>

            <TableCell>
              <Select
                value={row.resultListMode ?? 'Default'}
                options={resultListModeOptions}
                onValueChange={value => {
                  updateLocal(row.id, { resultListMode: value });
                  void commit(row.id, { resultListMode: value });
                }}
              />
            </TableCell>

            <TableCell>
              <Input
                type="number"
                step="0.01"
                aria-label={`${row.name} fee`}
                value={row.fee ?? ''}
                onChange={e =>
                  updateLocal(row.id, { fee: toFeeOrNull(e.target.value) })
                }
                onBlur={() => {
                  void commit(row.id, { fee: row.fee });
                }}
              />
            </TableCell>

            <TableCell>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center">
                      <Checkbox
                        aria-label={t(
                          'Pages.Event.Settings.Classes.LateEntryFeeDisabledAria',
                          {
                            name: row.name,
                          }
                        )}
                        checked={row.lateEntryFeeDisabled}
                        onCheckedChange={value => {
                          const next = value === true;
                          updateLocal(row.id, { lateEntryFeeDisabled: next });
                          void commit(row.id, { lateEntryFeeDisabled: next });
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    {t(
                      'Pages.Event.Settings.Classes.LateEntryFeeDisabledTooltip'
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableCell>

            <TableCell>
              <Select
                value={row.startMode ?? NONE}
                options={startModeOptions}
                onValueChange={value => {
                  const next = value === NONE ? null : value;
                  updateLocal(row.id, { startMode: next });
                  void commit(row.id, { startMode: next });
                }}
              />
            </TableCell>

            <TableCell>
              <Input
                type="number"
                aria-label={`${row.name} awardedPlaces`}
                value={row.awardedPlaces ?? ''}
                onChange={e =>
                  updateLocal(row.id, {
                    awardedPlaces: toIntOrNull(e.target.value),
                  })
                }
                onBlur={() => {
                  void commit(row.id, { awardedPlaces: row.awardedPlaces });
                }}
              />
            </TableCell>

            <TableCell>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={row.startMode === 'FreeStart'}
                onClick={() => setStartTimesClass(row)}
              >
                <Clock className="h-4 w-4" />
                {t('Pages.Event.Settings.Classes.StartTimes.Open')}
              </Button>
            </TableCell>
          </TableRow>
        )}
      />

      <ClassStartTimesDialog
        t={t}
        classId={startTimesClass?.id ?? null}
        className={startTimesClass?.name ?? ''}
        timezone={timezone}
        open={startTimesClass !== null}
        onOpenChange={open => {
          if (!open) setStartTimesClass(null);
        }}
      />
      <ConfirmDialog
        open={confirmLoadOpen}
        onOpenChange={setConfirmLoadOpen}
        title={t('Pages.Event.Settings.Classes.LoadDefinitions.ConfirmTitle')}
        description={t(
          'Pages.Event.Settings.Classes.LoadDefinitions.ConfirmDescription'
        )}
        confirmText={t(
          'Pages.Event.Settings.Classes.LoadDefinitions.ConfirmButton'
        )}
        cancelText={t('Operations.Cancel', { ns: 'common' })}
        onConfirm={() => {
          setConfirmLoadOpen(false);
          void handleLoadClassDefinitions();
        }}
      />
    </div>
  );
};
