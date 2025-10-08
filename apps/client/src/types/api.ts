// types/api.ts
export interface ApiResponse<T = any> {
  data?: T;
  errors?: Array<{ msg: string; param: string }>;
  message?: string;
}

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
