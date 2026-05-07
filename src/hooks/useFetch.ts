'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

interface UseFetchOptions {
  pollInterval?: number | false;
  refetchOnFocus?: boolean;
}

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  mutate: (newData: T) => void;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useFetch<T>(
  url: string | null,
  options: UseFetchOptions = {}
): UseFetchResult<T> {
  const { pollInterval = 30000, refetchOnFocus = true } = options;
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch: rqRefetch } = useQuery<T>({
    queryKey: [url],
    queryFn: () => fetcher<T>(url!),
    enabled: !!url,
    // Poll interval — TanStack handles visibility pausing automatically
    refetchInterval: pollInterval === false ? false : pollInterval,
    // Pause polling when tab is hidden (built-in!)
    refetchIntervalInBackground: false,
    // Refetch on window focus
    refetchOnWindowFocus: refetchOnFocus,
    // Use staleTime from QueryClient defaults (30s)
  });

  const refetch = useCallback(async () => {
    await rqRefetch();
  }, [rqRefetch]);

  const mutate = useCallback(
    (newData: T) => {
      if (url) {
        queryClient.setQueryData([url], newData);
      }
    },
    [url, queryClient]
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    mutate,
  };
}

// Helper for API calls — also invalidates relevant caches after mutations
export function useInvalidate() {
  const queryClient = useQueryClient();
  return useCallback(
    (urls: string[]) => {
      urls.forEach((url) => {
        queryClient.invalidateQueries({ queryKey: [url] });
      });
    },
    [queryClient]
  );
}

export async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string; status: number; conflict?: any }> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });

    const json = await res.json().catch(() => null);

    if (res.status === 409) {
      return { status: 409, conflict: json, error: json?.message || 'Conflict' };
    }

    if (!res.ok) {
      return { status: res.status, error: json?.error || `Error ${res.status}` };
    }

    return { data: json as T, status: res.status };
  } catch (err: any) {
    return { status: 0, error: err.message || 'Network error' };
  }
}
