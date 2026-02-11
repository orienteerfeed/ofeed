export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  traceId?: string;
  spanId?: string;
}

export interface ProblemFieldError {
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
  errors: ProblemFieldError[];
  [key: string]: unknown;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  error: null;
  meta: ResponseMeta;
}

export interface ErrorEnvelope {
  success: false;
  data: null;
  error: ProblemDetails;
  meta: ResponseMeta;
}

export type ApiResponseEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export const isSuccessEnvelope = <T>(
  response: ApiResponseEnvelope<T>,
): response is SuccessEnvelope<T> => response.success;

export const isErrorEnvelope = <T>(
  response: ApiResponseEnvelope<T>,
): response is ErrorEnvelope => !response.success;
