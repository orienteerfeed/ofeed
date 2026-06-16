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
  /**
   * Hide the built-in "Upload IOF XML" heading/description block. Use when the
   * surrounding UI already provides its own section title (e.g. the Files tab).
   */
  hideHeader?: boolean;
}
