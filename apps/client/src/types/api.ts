// types/api.ts

// Base response interface matching your actual API structure
export interface BaseApiResponse {
  message: string;
  error: boolean;
  code: number;
}

// Success response - matches your success() function
export interface SuccessApiResponse<T = any> extends BaseApiResponse {
  error: false;
  results: T;
}

// Error response - matches your error() function
export interface ErrorApiResponse extends BaseApiResponse {
  error: true;
  results?: never;
}

// Validation error detail
export interface ValidationError {
  msg: string;
  param: string;
}

// Validation response - matches your validation() function
export interface ValidationApiResponse extends BaseApiResponse {
  error: true;
  code: 422;
  message: 'Validation errors';
  errors: ValidationError[];
}

// Union type for all possible API responses
export type ApiResponse<T = any> =
  | SuccessApiResponse<T>
  | ErrorApiResponse
  | ValidationApiResponse;

// Type guards for better type narrowing
export const isSuccessResponse = <T>(
  response: ApiResponse<T>
): response is SuccessApiResponse<T> =>
  !response.error && 'results' in response;

export const isErrorResponse = (
  response: ApiResponse
): response is ErrorApiResponse => response.error && response.code !== 422;

export const isValidationResponse = (
  response: ApiResponse
): response is ValidationApiResponse =>
  response.error && response.code === 422 && 'errors' in response;

// Request state management
export interface RequestState<T = any> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

export interface RequestOptions extends RequestInit {
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  skipAuth?: boolean;
}

export interface UseRequestReturn<T = any> extends RequestState<T> {
  request: (url: string, options?: RequestOptions) => Promise<void>;
  clearError: () => void;
  clearData: () => void;
}

export interface UseFetchRequestReturn<T = any> extends UseRequestReturn<T> {
  refetch: (optionsUpdate?: RequestOptions) => void;
}
