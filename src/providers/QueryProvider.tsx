'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data stays "fresh" for 30s — no refetch if navigating back within 30s
            staleTime: 30 * 1000,
            // Keep unused data in memory for 5 min (instant load on revisit)
            gcTime: 5 * 60 * 1000,
            // Refetch when tab regains focus (but not if data is still fresh)
            refetchOnWindowFocus: true,
            // Don't refetch on remount if data is fresh
            refetchOnMount: true,
            // Retry failed requests once
            retry: 1,
            retryDelay: 1000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
