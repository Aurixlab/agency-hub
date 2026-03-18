'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const DEFAULT_POLL_INTERVAL = 30000; // 30s — plenty fast for 11 users, way less DB load

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

// Global dedup map: prevent multiple components from fetching the same URL simultaneously
const inflightRequests = new Map<string, Promise<any>>();

export function useFetch<T>(
  url: string | null,
  options: UseFetchOptions = {}
): UseFetchResult<T> {
  const { pollInterval = DEFAULT_POLL_INTERVAL, refetchOnFocus = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const urlRef = useRef(url);
  const lastFocusFetch = useRef(0);
  urlRef.current = url;

  const fetchData = useCallback(async (showLoading = false) => {
    const currentUrl = urlRef.current;
    if (!currentUrl || !mountedRef.current) return;

    if (showLoading) setLoading(true);

    // Abort any in-flight request from this hook instance
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Deduplicate: if the same URL is already being fetched, reuse the promise
      let promise = inflightRequests.get(currentUrl);
      if (!promise) {
        promise = fetch(currentUrl, { signal: controller.signal }).then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
        inflightRequests.set(currentUrl, promise);
        // Clean up after resolution
        promise.finally(() => inflightRequests.delete(currentUrl));
      }

      const json = await promise;
      if (mountedRef.current && !controller.signal.aborted) {
        setData(json);
        setError(null);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return; // Normal cleanup, ignore
      if (mountedRef.current) {
        setError(err.message || 'Failed to fetch');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (url) fetchData(true);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [url, fetchData]);

  // Polling — only when tab is visible
  useEffect(() => {
    if (!pollInterval || !url) return;

    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData(false);
      }
    }, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollInterval, url, fetchData]);

  // Refetch on tab return — debounced, single handler
  // Uses visibilitychange ONLY (not both focus + visibility which causes double-fetch)
  useEffect(() => {
    if (!refetchOnFocus) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Debounce: don't refetch if we fetched less than 2s ago
        const now = Date.now();
        if (now - lastFocusFetch.current > 2000) {
          lastFocusFetch.current = now;
          fetchData(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData, refetchOnFocus]);

  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  return { data, loading, error, refetch, mutate };
}

// Helper for API calls with error handling
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
