import { config } from '@/config';
import type {
  ApiResponse,
  SuccessApiResponse,
  ValidationApiResponse,
} from '@/types/api';
import { useAuthForRequest } from './useAuth';

const log = config.REQUEST_LOGGING
  ? (message: string, ...args: unknown[]) => {
      console.info(`[API] ${message}`, ...args);
    }
  : () => {};

/**
 * Hook for TanStack Query that provides authenticated API methods
 * Uses the same auth context as useRequest
 */
export const useApi = () => {
  const { token, logout } = useAuthForRequest();

  const createHeaders = (skipAuth: boolean = false): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (!skipAuth && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  };

  const handleResponse = async <T>(response: Response): Promise<T> => {
    // Handle 401 - automatic logout
    if (response.status === 401) {
      logout();
      throw new Error('Session expired. Please sign in again.');
    }

    // Parse response
    const contentType = response.headers.get('content-type');
    let data: ApiResponse<T>;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = {} as ApiResponse<T>;
    }

    // Handle errors
    if (!response.ok) {
      // Check if it's a validation error response
      const validationResponse = data as ValidationApiResponse;
      if (validationResponse.errors) {
        throw new Error(
          validationResponse.errors
            .map(err => `${err.msg}: ${err.param}`)
            .join(', ')
        );
      }

      // Handle other API errors
      throw new Error(
        data.message || `Request failed with status ${response.status}`
      );
    }

    // Extract data from ApiResponse wrapper - your API uses 'results' for success
    const successResponse = data as SuccessApiResponse<T>;
    return successResponse.results as T;
  };

  const get = async <T>(
    endpoint: string,
    options?: { skipAuth?: boolean }
  ): Promise<T> => {
    const url = `${config.BASE_API_URL}${endpoint}`;
    log(`GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(options?.skipAuth),
    });

    const result = await handleResponse<T>(response);
    log(`GET ${url} success`, result);
    return result;
  };

  const post = async <T>(
    endpoint: string,
    data?: unknown,
    options?: { skipAuth?: boolean }
  ): Promise<T> => {
    const url = `${config.BASE_API_URL}${endpoint}`;
    log(`POST ${url}`, data);

    const response = await fetch(url, {
      method: 'POST',
      headers: createHeaders(options?.skipAuth),
      body: JSON.stringify(data),
    });

    const result = await handleResponse<T>(response);
    log(`POST ${url} success`, result);
    return result;
  };

  const put = async <T>(
    endpoint: string,
    data?: unknown,
    options?: { skipAuth?: boolean }
  ): Promise<T> => {
    const url = `${config.BASE_API_URL}${endpoint}`;
    log(`PUT ${url}`, data);

    const response = await fetch(url, {
      method: 'PUT',
      headers: createHeaders(options?.skipAuth),
      body: JSON.stringify(data),
    });

    const result = await handleResponse<T>(response);
    log(`PUT ${url} success`, result);
    return result;
  };

  const del = async <T>(
    endpoint: string,
    options?: { skipAuth?: boolean }
  ): Promise<T> => {
    const url = `${config.BASE_API_URL}${endpoint}`;
    log(`DELETE ${url}`);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: createHeaders(options?.skipAuth),
    });

    const result = await handleResponse<T>(response);
    log(`DELETE ${url} success`, result);
    return result;
  };

  const patch = async <T>(
    endpoint: string,
    data?: unknown,
    options?: { skipAuth?: boolean }
  ): Promise<T> => {
    const url = `${config.BASE_API_URL}${endpoint}`;
    log(`PATCH ${url}`, data);

    const response = await fetch(url, {
      method: 'PATCH',
      headers: createHeaders(options?.skipAuth),
      body: JSON.stringify(data),
    });

    const result = await handleResponse<T>(response);
    log(`PATCH ${url} success`, result);
    return result;
  };

  return {
    get,
    post,
    put,
    delete: del,
    patch,
  };
};
