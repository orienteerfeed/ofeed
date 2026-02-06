export interface UploadedFile {
  name: string;
  data: string; // base64 data URL
  type: string; // mime type
  size: number; // bytes
  blob: Blob | File;
}

export interface DragDropFileProps {
  eventId: string;
  onUploadSuccess?: (response: unknown) => void;
  maxFiles?: number;
  allowedFormats?: string[];
}
