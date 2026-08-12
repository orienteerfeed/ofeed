import { ButtonWithSpinner } from '@/components/molecules';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { downloadBlob, toast } from '@/utils';
import { useForm } from '@tanstack/react-form';
import { QRCodeCanvas } from 'qrcode.react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  countBibLabels,
  generateBibLabels,
  MAX_QR_CODES,
} from './qrCodeGenerator.utils';
import {
  createQrCodeFormSchema,
  QR_SIZES_MM,
  type QrCodeFormValues,
} from './qrCodeGenerator.schema';
import { buildBibQrCodesPdf } from './qrCodePdf';

const PREVIEW_LIMIT = 6;

const fieldError = (errors: unknown[]) =>
  errors
    .map(error =>
      typeof error === 'string'
        ? error
        : (error as { message?: string } | undefined)?.message
    )
    .filter(Boolean)
    .join(', ');

export const QrCodeGeneratorForm = () => {
  const { t } = useTranslation();
  const schema = useMemo(() => createQrCodeFormSchema(t), [t]);
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm({
    defaultValues: {
      teamFrom: 1,
      teamTo: 10,
      legFrom: 1,
      legTo: 1,
      sizeMm: 45,
    } as QrCodeFormValues,
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      setIsGenerating(true);
      try {
        const labels = generateBibLabels(value);
        const blob = await buildBibQrCodesPdf(labels, {
          sizeMm: value.sizeMm,
          labelText: label =>
            t('Pages.Utils.QrCodes.LabelText', {
              team: label.team,
              leg: label.leg,
            }),
        });
        downloadBlob(
          blob,
          `bib-qr-codes-${value.teamFrom}-${value.teamTo}.pdf`
        );
      } catch (error) {
        console.error('Failed to generate QR code PDF:', error);
        toast({
          title: t('Operations.Error', { ns: 'common' }),
          description: t('Pages.Utils.QrCodes.Errors.PdfGenerationFailed'),
          variant: 'error',
        });
      } finally {
        setIsGenerating(false);
      }
    },
  });

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <form.Field name="teamFrom">
          {field => (
            <div className="space-y-2">
              <Label htmlFor="teamFrom">
                {t('Pages.Utils.QrCodes.Form.TeamFrom')}
              </Label>
              <Input
                id="teamFrom"
                type="number"
                min={1}
                max={9999}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.valueAsNumber)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  {fieldError(field.state.meta.errors)}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="teamTo">
          {field => (
            <div className="space-y-2">
              <Label htmlFor="teamTo">
                {t('Pages.Utils.QrCodes.Form.TeamTo')}
              </Label>
              <Input
                id="teamTo"
                type="number"
                min={1}
                max={9999}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.valueAsNumber)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  {fieldError(field.state.meta.errors)}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="legFrom">
          {field => (
            <div className="space-y-2">
              <Label htmlFor="legFrom">
                {t('Pages.Utils.QrCodes.Form.LegFrom')}
              </Label>
              <Input
                id="legFrom"
                type="number"
                min={1}
                max={99}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.valueAsNumber)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  {fieldError(field.state.meta.errors)}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="legTo">
          {field => (
            <div className="space-y-2">
              <Label htmlFor="legTo">
                {t('Pages.Utils.QrCodes.Form.LegTo')}
              </Label>
              <Input
                id="legTo"
                type="number"
                min={1}
                max={99}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.valueAsNumber)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  {fieldError(field.state.meta.errors)}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <div className="max-w-[200px] space-y-2">
        <Label htmlFor="sizeMm">{t('Pages.Utils.QrCodes.Form.Size')}</Label>
        <form.Field name="sizeMm">
          {field => (
            <Select
              value={String(field.state.value)}
              onValueChange={value =>
                field.handleChange(
                  Number(value) as (typeof QR_SIZES_MM)[number]
                )
              }
            >
              <SelectTrigger id="sizeMm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QR_SIZES_MM.map(size => (
                  <SelectItem key={size} value={String(size)}>
                    {size} mm
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </form.Field>
      </div>

      <form.Subscribe selector={state => state.values}>
        {values => {
          const count = countBibLabels(values);
          const previewLabels =
            count > 0 && count <= MAX_QR_CODES
              ? generateBibLabels(values).slice(0, PREVIEW_LIMIT)
              : [];

          return (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('Pages.Utils.QrCodes.Preview.Count', { count })}
              </p>
              {previewLabels.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  {previewLabels.map(label => (
                    <div
                      key={label.code}
                      className="flex flex-col items-center gap-1 rounded-lg border bg-white p-3"
                    >
                      <QRCodeCanvas
                        value={label.code}
                        size={96}
                        level="H"
                        marginSize={1}
                      />
                      <span className="text-xs text-muted-foreground">
                        {t('Pages.Utils.QrCodes.LabelText', {
                          team: label.team,
                          leg: label.leg,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      </form.Subscribe>

      <ButtonWithSpinner
        type="submit"
        disabled={!form.state.canSubmit || isGenerating}
        isSubmitting={isGenerating}
      >
        {isGenerating
          ? t('Pages.Utils.QrCodes.Form.Generating')
          : t('Pages.Utils.QrCodes.Form.Submit')}
      </ButtonWithSpinner>
    </form>
  );
};
