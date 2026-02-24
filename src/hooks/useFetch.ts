'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const POLL_INTERVAL = 8000; // 8 seconds

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

export function useFetch<T>(
  url: string | null,
  options: UseFetchOptions = {}
): UseFetchResult<T> {
  const { pollInterval = POLL_INTERVAL, refetchOnFocus = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVisible = useRef(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const fetchData = useCallback(async (showLoading = false) => {
    if (!urlRef.current) return;
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(urlRef.current);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (url) {
      fetchData(true);
    }
  }, [url, fetchData]);

  // Polling
  useEffect(() => {
    if (!pollInterval || !url) return;

    intervalRef.current = setInterval(() => {
      if (isVisible.current) {
        fetchData(false);
      }
    }, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollInterval, url, fetchData]);

  // Visibility change (pause polling when tab hidden)
  useEffect(() => {
    const handleVisibility = () => {
      isVisible.current = document.visibilityState === 'visible';
      if (isVisible.current && refetchOnFocus) {
        fetchData(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchData, refetchOnFocus]);

  // Refetch on window focus
  useEffect(() => {
    if (!refetchOnFocus) return;

    const handleFocus = () => fetchData(false);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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
