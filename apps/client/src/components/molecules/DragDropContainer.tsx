import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/types/upload';
import { Upload, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../utils/toast';

export interface DragDropContainerProps {
  /** Already uploaded/selected items */
  uploadedFiles: UploadedFile[];
  /** Callback with newly added files */
  onUpload: (files: UploadedFile[]) => void;
  /** Remove item at given index */
  onDelete: (index: number) => void;
  /** Custom file validation function */
  onFileValidation?: (
    files: File[]
  ) => UploadedFile[] | Promise<UploadedFile[]>;
  /** Max number of files allowed */
  count: number;
  /** Allowed formats (by subtype or extension), e.g. ['xml'] or ['png','jpg'] */
  formats: string[];
  /** Extra class for the drop area */
  className?: string;
}

/** Minimal helper: turn formats into an accept string */
function formatsToAccept(formats: string[]): string {
  const lower = formats.map(f => f.toLowerCase());
  const set = new Set<string>();
  for (const f of lower) {
    if (f === 'xml') {
      set.add('application/xml');
      set.add('text/xml');
      set.add('.xml');
    } else if (f.startsWith('.')) {
      set.add(f);
    } else {
      // assume subtype or ext
      set.add(`.${f}`);
      set.add(`image/${f}`);
      set.add(`application/${f}`);
      set.add(`text/${f}`);
    }
  }
  return Array.from(set).join(',');
}

function fileMatchesFormats(file: File, formats: string[]): boolean {
  if (formats.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  for (const raw of formats) {
    const f = raw.toLowerCase();
    if (f === 'xml') {
      if (
        type === 'application/xml' ||
        type === 'text/xml' ||
        name.endsWith('.xml')
      )
        return true;
    } else if (f.startsWith('.')) {
      if (name.endsWith(f)) return true;
    } else {
      if (type.endsWith(`/${f}`) || name.endsWith(`.${f}`)) return true;
    }
  }
  return false;
}

async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const DragDropContainer = ({
  uploadedFiles = [],
  onUpload,
  onDelete,
  onFileValidation,
  count,
  formats,
  className,
}: DragDropContainerProps) => {
  const { t } = useTranslation();
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const accept = React.useMemo(() => formatsToAccept(formats), [formats]);

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files);

      // max items check vs current
      if (uploadedFiles.length >= count) {
        toast({
          title: t('Molecules.DragDrop.Toast.MaximumFiles.Title'),
          description: t('Molecules.DragDrop.Toast.MaximumFiles.Description', {
            count,
          }),
          variant: 'warning',
        });
        return;
      }

      // file count limit in one go
      if (count && fileArr.length > count) {
        toast({
          title: t('ErrorMessage', { ns: 'common' }),
          description:
            count !== 1
              ? t('Molecules.DragDrop.Toast.Error.DescriptionPlural', { count })
              : t('Molecules.DragDrop.Toast.Error.DescriptionSingle', {
                  count,
                }),
          variant: 'error',
        });
        return;
      }

      try {
        let converted: UploadedFile[];

        // Use custom validation if provided
        if (onFileValidation) {
          converted = await onFileValidation(fileArr);
        } else {
          // Default validation
          const allValid = fileArr.every(f => fileMatchesFormats(f, formats));
          if (!allValid) {
            toast({
              title: t('Molecules.DragDrop.Toast.InvalidFileFormat.Title'),
              description:
                t('Molecules.DragDrop.Toast.InvalidFileFormat.Description') +
                ` ${formats.join(', ').toUpperCase()}`,
              variant: 'warning',
            });
            return;
          }

          // convert to base64
          converted = await Promise.all(
            fileArr.map(async f => ({
              name: f.name,
              data: await toBase64(f),
              type: f.type || 'application/octet-stream',
              size: f.size,
              blob: new Blob([f], {
                type: f.type || 'application/octet-stream',
              }),
            }))
          );
        }

        onUpload(converted);
        if (fileRef.current) fileRef.current.value = '';
      } catch (error) {
        toast({
          title: t('Operations.Error', { ns: 'common' }),
          description: t('Molecules.DragDrop.Toast.ProcessingError'),
          variant: 'error',
        });
      }
    },
    [count, formats, onUpload, onFileValidation, uploadedFiles.length, t]
  );

  // Event handlers
  const onDrop: React.DragEventHandler<HTMLDivElement> = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer?.files?.length) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const onDragLeave: React.DragEventHandler<HTMLDivElement> = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = e => {
    if (e.currentTarget.files?.length) {
      void handleFiles(e.currentTarget.files);
    }
  };

  return (
    <>
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'mt-4 flex items-center justify-center rounded-md border-2 py-5 text-center',
          dragging
            ? 'border-[#2B92EC] bg-[#EDF2FF]'
            : 'border-dashed border-[#e0e0e0]',
          className
        )}
      >
        <div className="flex flex-1 flex-col items-center">
          <div className="mb-2 text-gray-400">
            <Upload className="h-5 w-5" aria-hidden />
          </div>

          <input
            ref={fileRef}
            className="hidden"
            type="file"
            multiple
            accept={accept}
            onChange={onInputChange}
          />

          <div className="text-[12px] font-normal text-gray-500 dark:text-gray-400">
            <button
              type="button"
              className="text-[#4070f4] underline-offset-2 hover:underline"
              onClick={() => fileRef.current?.click()}
            >
              {t('Molecules.DragDrop.ClickToUpload')}
            </button>{' '}
            {t('Molecules.DragDrop.OrDragAndDrop')}
          </div>

          <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
            {t('Molecules.DragDrop.SupportedFormats')}{' '}
            {formats.join(', ').toUpperCase()}
          </div>
        </div>
      </div>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          {uploadedFiles.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="space-y-3 rounded-md bg-slate-200 px-3 py-3.5"
            >
              <div className="flex justify-between">
                <div className="flex w-[70%] items-center gap-2">
                  <div className="text-[32px] text-[#5E62FF]">
                    {item.type?.match(/^image\//i) ? 'image' : 'file'}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {item.name}
                    </div>
                    <div className="text-[10px] font-medium text-gray-500">
                      {`${Math.floor(item.size / 1024)} KB`}
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 justify-end">
                  <div className="space-y-1 text-right">
                    <button
                      type="button"
                      className="text-[17px] text-gray-600 hover:text-gray-900 dark:text-gray-300"
                      onClick={() => onDelete(index)}
                      aria-label={t('Molecules.DragDrop.Delete') as string}
                      title={t('Molecules.DragDrop.Delete') as string}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                    <div className="text-[10px] font-medium text-gray-500">
                      {t('Molecules.DragDrop.Done')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
