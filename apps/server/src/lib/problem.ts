export interface FieldError {
  field?: string;
  pointer?: string;
  message: string;
  code?: string;
  reason?: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors: FieldError[];
  [key: string]: unknown;
}
