import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRequest } from '../../hooks';
import ENDPOINTS from '../../lib/api/endpoints';
import type { DragDropFileProps, UploadedFile } from '../../types/upload';
import { toast } from '../../utils/toast';
import { DragDropContainer } from '../molecules/DragDropContainer';

export const DragDropFile: React.FC<DragDropFileProps> = ({
  eventId,
  onUploadSuccess,
  maxFiles = 1,
  allowedFormats = ['xml'],
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const request = useRequest();
  const { t } = useTranslation();

  const handleFileValidation = async (
    files: File[]
  ): Promise<UploadedFile[]> => {
    const validFiles: UploadedFile[] = [];

    for (const file of files) {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      // Check file format
      if (!allowedFormats.includes(fileExtension || '')) {
        toast({
          title: t('Organisms.DragDrop.Toast.InvalidFormat'),
          description: t('Organisms.DragDrop.Toast.AllowedFormats', {
            formats: allowedFormats.join(', '),
          }),
          variant: 'warning',
        });
        continue;
      }

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: t('Organisms.DragDrop.Toast.FileTooLarge'),
          description: t('Organisms.DragDrop.Toast.MaxSize'),
          variant: 'warning',
        });
        continue;
      }

      try {
        // Convert to base64
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        validFiles.push({
          blob: file,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data: data,
        });
      } catch (error) {
        console.error('Error processing file:', error);
        toast({
          title: t('Organisms.DragDrop.Toast.ProcessingError'),
          description: t('Organisms.DragDrop.Toast.TryAgain'),
          variant: 'error',
        });
      }
    }

    return validFiles;
  };

  const uploadFiles = async (files: UploadedFile[]) => {
    if (isUploading) {
      toast({
        title: t('Organisms.DragDrop.Toast.UploadInProgress'),
        variant: 'warning',
      });
      return;
    }

    console.log('Starting upload of', files.length, 'files');
    setUploadedFiles(prev => [...prev, ...files]);
    setIsUploading(true);

    const formData = new FormData();
    formData.append('eventId', eventId);

    // Use for...of loop
    for (const file of files) {
      const asFile =
        file.blob instanceof File
          ? file.blob
          : new File([file.blob], file.name, { type: file.type });
      const toSend = await gzipBlobToFile(asFile, asFile.name);
      formData.append('file', toSend, toSend.name);
    }

    try {
      await request.request(ENDPOINTS.uploadIofXml(), {
        method: 'POST',
        body: formData,
        onSuccess: (response: unknown) => {
          console.log('Files uploaded successfully:', response);

          toast({
            title: t('Operations.Success', { ns: 'common' }),
            description: t('Organisms.DragDrop.Toast.UploadSuccess'),
            variant: 'success',
          });

          setUploadedFiles([]);
          onUploadSuccess?.(response);
          console.log('Files uploaded and drag-drop area cleared.');
        },
        onError: (errorMessage: string) => {
          console.error('Error uploading files:', errorMessage);

          toast({
            title: t('Operations.Error', { ns: 'common' }),
            description:
              errorMessage || t('Organisms.DragDrop.Toast.UploadFail'),
            variant: 'error',
          });
        },
      });
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t('Organisms.DragDrop.Toast.UploadFail'),
        variant: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full space-y-4">
      <div className="pb-2 border-b border-border">
        <h2 className="font-semibold text-foreground">
          {t('Organisms.DragDrop.UploadIofXml.Title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('Organisms.DragDrop.UploadIofXml.Description')}
        </p>
      </div>

      <DragDropContainer
        uploadedFiles={uploadedFiles}
        onUpload={uploadFiles}
        onDelete={deleteFile}
        onFileValidation={handleFileValidation}
        count={maxFiles}
        formats={allowedFormats}
      />
    </div>
  );
};

// Helper: gzip -> File .gz (fallback: no compression)
async function gzipBlobToFile(blob: Blob, origName: string): Promise<File> {
  // Modern browsers: CompressionStream('gzip')
  type CompressionStreamCtor = new (
    format: string
  ) => TransformStream<Uint8Array, Uint8Array>;
  const compressionStreamCtor = (
    window as Window & { CompressionStream?: CompressionStreamCtor }
  ).CompressionStream;

  if (typeof compressionStreamCtor === 'function') {
    const cs = new compressionStreamCtor('gzip');
    const gzStream = blob.stream().pipeThrough(cs);
    const gzBlob = await new Response(gzStream).blob();
    const name = origName.endsWith('.gz') ? origName : `${origName}.gz`;
    return new File([gzBlob], name, { type: 'application/gzip' });
  }
  // Fallback (you can replace with pako library if you need gzip in older browsers)
  return new File([blob], origName, {
    type: blob.type || 'application/octet-stream',
  });
}
