import { environmentManager, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiError;
  }
}

/** A 4xx will not fix itself on retry; network failures (status 0) and 5xx get three tries. */
function shouldRetry(failureCount: number, error: ApiError): boolean {
  const isClientError = error.status >= 400 && error.status < 500;
  return !isClientError && failureCount < 3;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Above 0 so data hydrated from a Server Component isn't refetched on mount.
      queries: { staleTime: 60_000, retry: shouldRetry },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** Server: a fresh client per request. Browser: one singleton that survives Suspense re-renders. */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) {
    return makeQueryClient();
  }

  return (browserQueryClient ??= makeQueryClient());
}
