import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (replaces cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// API base configuration
// Vite provides `import.meta.env` with typed access to VITE_ vars
const API_BASE_URL = (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const API_TIMEOUT_MS = Number((import.meta as unknown as { env?: { VITE_API_TIMEOUT_MS?: string } }).env?.VITE_API_TIMEOUT_MS || '0');

export class ApiClient {
  private baseURL: string;
  private timeoutMs: number;

  constructor(baseURL: string = API_BASE_URL, timeoutMs: number = API_TIMEOUT_MS) {
    this.baseURL = baseURL;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const timeoutController = new AbortController();
    let timeoutReached = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (this.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timeoutReached = true;
        timeoutController.abort();
      }, this.timeoutMs);
    }

    let removeExternalAbortListener: (() => void) | null = null;
    if (init?.signal) {
      if (init.signal.aborted) {
        timeoutController.abort();
      } else {
        const forwardAbort = () => timeoutController.abort();
        init.signal.addEventListener('abort', forwardAbort);
        removeExternalAbortListener = () => init.signal?.removeEventListener('abort', forwardAbort);
      }
    }

    try {
      return await fetch(url, {
        ...init,
        signal: timeoutController.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (timeoutReached && this.timeoutMs > 0) {
          throw new Error(`API Timeout: request exceeded ${Math.round(this.timeoutMs / 1000)}s`);
        }
        throw error;
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (removeExternalAbortListener) {
        removeExternalAbortListener();
      }
    }
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    const url = new URL(`${this.baseURL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await this.fetchWithTimeout(url.toString(), {
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

export const apiClient = new ApiClient();