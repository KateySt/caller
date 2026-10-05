import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** How often status and history are re-fetched while mounted (front SPEC-03 AC-18). */
export const TELEGRAM_REFRESH_INTERVAL_MS = 10_000;

export const telegramQueries = {
  all: (userId: string) => ["telegram", userId] as const,
  status: (userId: string) =>
    queryOptions({
      queryKey: [...telegramQueries.all(userId), "status"] as const,
      queryFn: ({ signal }) => api.getTelegramStatus(userId, { signal }),
      // Always refetch on open (cached data shows meanwhile); then poll while mounted.
      staleTime: 0,
      refetchInterval: TELEGRAM_REFRESH_INTERVAL_MS,
    }),
  /** The most recent window of messages; older pages are loaded on request, not polled. */
  recentMessages: (userId: string) =>
    queryOptions({
      queryKey: [...telegramQueries.all(userId), "messages"] as const,
      queryFn: ({ signal }) => api.listTelegramMessages(userId, { signal }),
      staleTime: 0,
      refetchInterval: TELEGRAM_REFRESH_INTERVAL_MS,
    }),
};
