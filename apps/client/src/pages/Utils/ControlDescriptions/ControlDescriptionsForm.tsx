import { ButtonWithSpinner, DragDropContainer } from '@/components/molecules';
import { Alert } from '@/components/organisms';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UploadedFile } from '@/types/upload';
import { downloadBlob, toast } from '@/utils';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildControlDescriptionsPdf,
  MAX_PAGES,
  PAPER_WIDTHS_MM,
  type CourseSelection,
  type PaperWidthMm,
} from './controlDescriptionPdf';
import { collectUnmappedSymbols } from './iofSymbols';
import { parsePpen, type PpenData } from './ppen';

interface CourseChoice {
  selected: boolean;
  copies: number;
}

const defaultChoices = (data: PpenData): Record<number, CourseChoice> =>
  Object.fromEntries(
    data.courses.map(course => [course.id, { selected: true, copies: 1 }])
  );

export const ControlDescriptionsForm = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<PpenData | null>(null);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [choices, setChoices] = useState<Record<number, CourseChoice>>({});
  const [widthMm, setWidthMm] = useState<PaperWidthMm>(PAPER_WIDTHS_MM[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState('');

  const lengthFormat = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [i18n.language]
  );

  const unmapped = useMemo(
    () => (data ? collectUnmappedSymbols(data.courses) : []),
    [data]
  );

  /** Alphabetical, matching the class list on the event info tab. */
  const courses = useMemo(
    () =>
      [...(data?.courses ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );

  /** The filter only hides rows; hidden courses stay selected for the PDF. */
  const visibleCourses = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle
      ? courses.filter(course => course.name.toLowerCase().includes(needle))
      : courses;
  }, [courses, filter]);

  const selections: CourseSelection[] = useMemo(
    () =>
      courses
        .filter(course => choices[course.id]?.selected)
        .map(course => ({ course, copies: choices[course.id]?.copies ?? 1 })),
    [courses, choices]
  );

  const totalPages = selections.reduce(
    (sum, selection) => sum + selection.copies,
    0
  );
  const allSelected =
    visibleCourses.length > 0 &&
    visibleCourses.every(course => choices[course.id]?.selected);
  const tooManyPages = totalPages > MAX_PAGES;

  const clearFile = () => {
    setData(null);
    setChoices({});
    setFile(null);
    setFilter('');
  };

  const handleFile = async (uploaded: UploadedFile | undefined) => {
    if (!uploaded) return;

    try {
      const parsed = parsePpen(await uploaded.blob.text());
      setData(parsed);
      setChoices(defaultChoices(parsed));
      setFile(uploaded);
      setFilter('');
    } catch (error) {
      console.error('Failed to read the .ppen file:', error);
      clearFile();
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t('Pages.Utils.ControlDescriptions.Errors.ParseFailed'),
        variant: 'error',
      });
    }
  };

  const setChoice = (courseId: number, change: Partial<CourseChoice>) =>
    setChoices(previous => ({
      ...previous,
      [courseId]: { ...previous[courseId]!, ...change },
    }));

  /** Only the rows the filter leaves visible. */
  const toggleAll = (selected: boolean) =>
    setChoices(previous => {
      const next = { ...previous };
      for (const course of visibleCourses) {
        next[course.id] = { ...previous[course.id]!, selected };
      }
      return next;
    });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || selections.length === 0 || tooManyPages) return;

    setIsGenerating(true);
    setProgress(0);
    try {
      const blob = await buildControlDescriptionsPdf({
        eventTitle: data.eventTitle,
        widthMm,
        selections,
        formatLength: km =>
          t('Pages.Utils.ControlDescriptions.Pdf.Length', {
            length: lengthFormat.format(km),
          }),
        formatClimb: metres =>
          metres === null
            ? ''
            : t('Pages.Utils.ControlDescriptions.Pdf.Climb', {
                climb: Math.round(metres),
              }),
        onProgress: setProgress,
      });

      downloadBlob(blob, 'control-descriptions.pdf');
    } catch (error) {
      console.error('Failed to generate the control descriptions PDF:', error);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Utils.ControlDescriptions.Errors.PdfGenerationFailed'
        ),
        variant: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>{t('Pages.Utils.ControlDescriptions.Form.File')}</Label>
        <DragDropContainer
          uploadedFiles={file ? [file] : []}
          onUpload={files => void handleFile(files[0])}
          onDelete={clearFile}
          count={1}
          formats={['ppen']}
        />
        <p className="text-sm text-muted-foreground">
          {t('Pages.Utils.ControlDescriptions.Form.FileHint')}
        </p>
      </div>

      {data && (
        <>
          <div className="space-y-1">
            <p className="font-medium">{data.eventTitle}</p>
            <p className="text-sm text-muted-foreground">
              {t('Pages.Utils.ControlDescriptions.Loaded', {
                fileName: file?.name,
                count: data.courses.length,
              })}
            </p>
          </div>

          {unmapped.length > 0 && (
            <Alert severity="warning" variant="outlined">
              {t('Pages.Utils.ControlDescriptions.Warnings.UnmappedSymbols', {
                count: unmapped.length,
                refs: unmapped
                  .map(symbol => `${symbol.ref} (${symbol.count}x)`)
                  .join(', '),
              })}
            </Alert>
          )}

          <Input
            type="search"
            className="max-w-sm"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder={t('Pages.Utils.ControlDescriptions.Form.Filter')}
            aria-label={t('Pages.Utils.ControlDescriptions.Form.Filter')}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={checked => toggleAll(checked === true)}
                    aria-label={t(
                      'Pages.Utils.ControlDescriptions.Form.SelectAll'
                    )}
                  />
                </TableHead>
                <TableHead>
                  {t('Pages.Utils.ControlDescriptions.Form.Course')}
                </TableHead>
                <TableHead className="text-right">
                  {t('Pages.Utils.ControlDescriptions.Form.Controls')}
                </TableHead>
                <TableHead className="text-right">
                  {t('Pages.Utils.ControlDescriptions.Form.Length')}
                </TableHead>
                <TableHead className="text-right">
                  {t('Pages.Utils.ControlDescriptions.Form.Climb')}
                </TableHead>
                <TableHead className="w-24 text-right">
                  {t('Pages.Utils.ControlDescriptions.Form.Copies')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCourses.map(course => {
                const choice = choices[course.id]!;
                return (
                  <TableRow key={course.id}>
                    <TableCell>
                      <Checkbox
                        checked={choice.selected}
                        onCheckedChange={checked =>
                          setChoice(course.id, { selected: checked === true })
                        }
                        aria-label={course.name}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{course.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {course.rows.length}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {course.length > 0
                        ? t('Pages.Utils.ControlDescriptions.Pdf.Length', {
                            length: lengthFormat.format(course.length),
                          })
                        : '–'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {course.climb !== null
                        ? t('Pages.Utils.ControlDescriptions.Pdf.Climb', {
                            climb: Math.round(course.climb),
                          })
                        : '–'}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="text-right"
                        value={choice.copies}
                        disabled={!choice.selected}
                        onChange={event =>
                          setChoice(course.id, {
                            copies: Math.max(
                              1,
                              event.target.valueAsNumber || 1
                            ),
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="max-w-[200px] space-y-2">
            <Label htmlFor="paperWidth">
              {t('Pages.Utils.ControlDescriptions.Form.PaperWidth')}
            </Label>
            <Select
              value={String(widthMm)}
              onValueChange={value => setWidthMm(Number(value) as PaperWidthMm)}
            >
              <SelectTrigger id="paperWidth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPER_WIDTHS_MM.map(width => (
                  <SelectItem key={width} value={String(width)}>
                    {width} mm
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('Pages.Utils.ControlDescriptions.Preview.Total', {
                count: totalPages,
              })}
            </p>
            {tooManyPages && (
              <Alert severity="error" variant="outlined">
                {t('Pages.Utils.ControlDescriptions.Validation.TooManyPages', {
                  max: MAX_PAGES,
                })}
              </Alert>
            )}

            <ButtonWithSpinner
              type="submit"
              disabled={totalPages === 0 || tooManyPages || isGenerating}
              isSubmitting={isGenerating}
            >
              {isGenerating
                ? t('Pages.Utils.ControlDescriptions.Form.Generating', {
                    done: progress,
                    total: totalPages,
                  })
                : t('Pages.Utils.ControlDescriptions.Form.Submit')}
            </ButtonWithSpinner>
          </div>
        </>
      )}
    </form>
  );
};
