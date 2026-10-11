import { TFunction } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/atoms';
import { DragDropContainer } from '@/components/molecules';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRequest } from '@/hooks/useRequest';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { UploadedFile } from '@/types/upload';
import { toast } from '@/utils';

type RentalCardImportDialogProps = {
  t: TFunction;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void | Promise<void>;
};

export const RentalCardImportDialog = ({
  t,
  eventId,
  open,
  onOpenChange,
  onImported,
}: RentalCardImportDialogProps) => {
  const request = useRequest();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const reset = () => {
    setUploadedFiles([]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    const selectedFile = uploadedFiles[0];
    if (!selectedFile) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Event.Settings.Services.RentalCards.ImportDialog.MissingFile'
        ),
        variant: 'warning',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile.blob, selectedFile.name);

    setIsUploading(true);
    try {
      await request.request(ENDPOINTS.eventRentalCardsImport(eventId), {
        method: 'POST',
        body: formData,
        onSuccess: async data => {
          const imported = (data as { imported?: number } | null)?.imported ?? 0;
          toast({
            title: t('Operations.Success', { ns: 'common' }),
            description: t(
              'Pages.Event.Settings.Services.RentalCards.ImportDialog.Success',
              { count: imported }
            ),
            variant: 'default',
          });
          reset();
          onOpenChange(false);
          await onImported();
        },
        onError: errorMessage => {
          toast({
            title: t('Operations.Error', { ns: 'common' }),
            description:
              errorMessage || t('Errors.Generic', 'Something went wrong'),
            variant: 'error',
          });
        },
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Event.Settings.Services.RentalCards.ImportDialog.Title')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Pages.Event.Settings.Services.RentalCards.ImportDialog.Description'
            )}
          </DialogDescription>
        </DialogHeader>

        <DragDropContainer
          uploadedFiles={uploadedFiles}
          onUpload={files => setUploadedFiles(files.slice(0, 1))}
          onDelete={index =>
            setUploadedFiles(files =>
              files.filter((_, itemIndex) => itemIndex !== index)
            )
          }
          count={1}
          formats={['csv']}
          isUploading={isUploading}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('Operations.Cancel', { ns: 'common' })}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isUploading}>
            {isUploading
              ? t(
                  'Pages.Event.Settings.Services.RentalCards.ImportDialog.Importing'
                )
              : t(
                  'Pages.Event.Settings.Services.RentalCards.ImportDialog.Import'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
