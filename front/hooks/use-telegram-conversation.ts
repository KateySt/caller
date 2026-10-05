"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type TelegramMessage } from "@/lib/api";
import { telegramQueries } from "@/lib/queries/telegram";

type LoadState = { phase: "loading" } | { phase: "ready" } | { phase: "error"; message: string };

interface EarlierPages {
  messages: TelegramMessage[];
  hasMore: boolean;
}

/**
 * Server state of one contact's Telegram conversation: status and the most recent window of
 * messages (both polled while mounted — a failed poll keeps the last good data), plus any
 * older pages the operator loaded on request. Those are kept apart because re-polling them
 * every few seconds would be wasted work.
 */
export function useTelegramConversation(userId: string) {
  const statusQuery = useQuery(telegramQueries.status(userId));
  const recentQuery = useQuery(telegramQueries.recentMessages(userId));

  const [earlier, setEarlier] = useState<EarlierPages | null>(null);

  const messages = useMemo(() => {
    const byId = new Map<string, TelegramMessage>();
    for (const message of [...(earlier?.messages ?? []), ...(recentQuery.data?.messages ?? [])]) {
      byId.set(message.id, message);
    }

    return [...byId.values()];
  }, [earlier, recentQuery.data]);

  // Only a load with nothing to show is an error; a failed background poll isn't.
  const failedQuery = [statusQuery, recentQuery].find((query) => query.isError && !query.data);
  const loadState: LoadState = failedQuery?.error
    ? { phase: "error", message: failedQuery.error.message }
    : statusQuery.data && recentQuery.data
      ? { phase: "ready" }
      : { phase: "loading" };

  const loadEarlierMutation = useMutation({
    mutationFn: (before: string) => api.listTelegramMessages(userId, { before }),
    onSuccess: (page) =>
      setEarlier((previous) => ({
        messages: [...page.messages, ...(previous?.messages ?? [])],
        hasMore: page.hasMore,
      })),
  });
  const { mutateAsync: fetchEarlierPage } = loadEarlierMutation;

  /** Fetches the page before the oldest shown message; rejects on failure. */
  const loadEarlier = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest) {
      return;
    }
    await fetchEarlierPage(oldest.id);
  }, [messages, fetchEarlierPage]);

  const { refetch: refetchStatus } = statusQuery;
  const { refetch: refetchRecent } = recentQuery;
  /** The error view's Retry. */
  const retry = useCallback(() => {
    void refetchStatus();
    void refetchRecent();
  }, [refetchStatus, refetchRecent]);

  return {
    statusInfo: statusQuery.data ?? null,
    messages,
    hasEarlier: earlier ? earlier.hasMore : (recentQuery.data?.hasMore ?? false),
    loadState,
    retry,
    loadEarlier,
    /** After a successful delete (AC-22): the recent window is emptied in the cache. */
    clearEarlier: () => setEarlier(null),
  };
}
