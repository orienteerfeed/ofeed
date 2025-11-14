import { config } from '@/config';
import type {
  ApiResponse,
  RequestOptions,
  RequestState,
  UseRequestReturn,
  ValidationApiResponse,
} from '@/types/api';
import { useCallback, useRef, useState } from 'react';
import { toast } from '../utils';
import { useAuthForRequest } from './useAuth';

const log = config.REQUEST_LOGGING
  ? (message: string, ...args: any[]) => {
      console.info(`[API] ${message}`, ...args);
    }
  : () => {};

// Helper function to normalize headers into Record<string, string>
function normalizeHeaders(headers: HeadersInit = {}): Record<string, string> {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    const result: Record<string, string> = {};
    headers.forEach(([key, value]) => {
      result[key] = value;
    });
    return result;
  }

  // If it's already a Record<string, string>, return it directly
  return headers as Record<string, string>;
}

export const useRequest = <T = any>(
  initialState: Partial<RequestState<T>> = {}
): UseRequestReturn<T> => {
  const { token, logout } = useAuthForRequest();
  const [state, setState] = useState<RequestState<T>>({
    data: null,
    isLoading: false,
    error: null,
    ...initialState,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => {
    setState((prev: RequestState<T>) => ({ ...prev, error: null }));
  }, []);

  const clearData = useCallback(() => {
    setState((prev: RequestState<T>) => ({ ...prev, data: null }));
  }, []);

  const request = useCallback(
    async (url: string, options: RequestOptions = {}) => {
      const {
        method = 'GET',
        headers = {},
        onSuccess,
        onError,
        skipAuth = false,
        ...fetchOptions
      } = options;

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('New request started');
      }

      abortControllerRef.current = new AbortController();

      log(`${method} ${url}`, options);

      setState((prev: RequestState<T>) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        // Normalize headers to Record<string, string>
        const normalizedHeaders = normalizeHeaders(headers);

        // Construct auth headers
        const authHeaders =
          !skipAuth && token ? { Authorization: `Bearer ${token}` } : {};

        // Create final headers object
        const requestHeaders: Record<string, string> = {
          ...authHeaders,
          ...normalizedHeaders,
        };

        // Only add Content-Type if not FormData and not already set
        if (
          !(fetchOptions.body instanceof FormData) &&
          !requestHeaders['Content-Type']
        ) {
          requestHeaders['Content-Type'] = 'application/json';
        }

        const fullUrl = `${config.BASE_API_URL}${url}`;

        const response = await fetch(fullUrl, {
          method,
          headers: requestHeaders,
          signal: abortControllerRef.current.signal,
          ...fetchOptions,
        });

        // Handle unauthorized - automatic logout
        if (response.status === 401 && !skipAuth) {
          logout();
          throw new Error('Session expired. Please sign in again.');
        }

        let data: ApiResponse<T>;

        // Handle empty responses
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = {} as ApiResponse<T>;
        }

        if (!response.ok) {
          // Handle validation errors - use type assertion for ValidationApiResponse
          const validationData = data as ValidationApiResponse;
          if (validationData.errors) {
            throw new Error(
              validationData.errors
                .map(
                  (err: { msg: string; param: string }) =>
                    `${err.msg}: ${err.param}`
                )
                .join(', ')
            );
          }

          // Handle other errors
          throw new Error(
            data.message || `Request failed with status ${response.status}`
          );
        }

        log(`${method} ${url} success`, data);

        // Extract data from the response - your API uses 'results' for success
        const responseData = 'results' in data ? data.results : data;

        setState((prev: RequestState<T>) => ({
          ...prev,
          data: responseData as T,
          isLoading: false,
          error: null,
        }));

        onSuccess?.(responseData as T);
      } catch (error: any) {
        // Ignore abort errors
        if (error.name === 'AbortError') {
          return;
        }

        const errorMessage = error.message || 'An unexpected error occurred';

        log(`${method} ${url} error`, error);

        setState((prev: RequestState<T>) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));

        // Only show toast for non-401 errors
        if (!errorMessage.includes('Session expired')) {
          toast({
            title: 'Request Failed',
            description: errorMessage,
            variant: 'error',
          });
        }

        onError?.(errorMessage);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [token, logout]
  );

  return {
    ...state,
    request,
    clearError,
    clearData,
  };
};
