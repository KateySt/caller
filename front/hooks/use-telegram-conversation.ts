"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type TelegramMessage, type TelegramStatusInfo } from "@/lib/api";

/** How often status and history are re-fetched while mounted (front SPEC-03 AC-18). */
const REFRESH_INTERVAL_MS = 10_000;

type LoadState = { phase: "loading" } | { phase: "ready" } | { phase: "error"; message: string };

/**
 * Server state of one contact's Telegram conversation: status, the most recent window of
 * messages (replaced on every refresh) and any older pages the operator loaded on request.
 * Polls while mounted; a stale response (superseded by a newer request, send or delete)
 * is dropped, and a failed background poll keeps the last good state.
 */
export function useTelegramConversation(userId: string) {
  const [statusInfo, setStatusInfo] = useState<TelegramStatusInfo | null>(null);
  const [recentMessages, setRecentMessages] = useState<TelegramMessage[]>([]);
  const [earlierMessages, setEarlierMessages] = useState<TelegramMessage[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "loading" });

  const latestRequestRef = useRef(0);
  const hasLoadedEarlierRef = useRef(false);

  const refresh = useCallback(
    async (options: { isPoll: boolean }) => {
      const requestNumber = ++latestRequestRef.current;
      try {
        const [nextStatus, page] = await Promise.all([
          api.getTelegramStatus(userId),
          api.listTelegramMessages(userId),
        ]);
        if (requestNumber !== latestRequestRef.current) {
          return;
        }

        setStatusInfo(nextStatus);
        setRecentMessages(page.messages);
        if (!hasLoadedEarlierRef.current) {
          setHasEarlier(page.hasMore);
        }
        setLoadState({ phase: "ready" });
      } catch (error) {
        if (requestNumber !== latestRequestRef.current || options.isPoll) {
          return;
        }
        setLoadState({
          phase: "error",
          message: error instanceof Error ? error.message : "Could not load Telegram data.",
        });
      }
    },
    [userId],
  );

  useEffect(() => {
    // Deferred a tick so the first load, like every poll, sets state from a callback
    // rather than synchronously inside the effect body.
    const initialLoad = setTimeout(() => void refresh({ isPoll: false }), 0);
    const interval = setInterval(() => void refresh({ isPoll: true }), REFRESH_INTERVAL_MS);

    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [refresh]);

  const messages = useMemo(() => {
    const byId = new Map<string, TelegramMessage>();
    for (const message of [...earlierMessages, ...recentMessages]) {
      byId.set(message.id, message);
    }

    return [...byId.values()];
  }, [earlierMessages, recentMessages]);

  /** Back to the loading state and refetch (the error view's Retry). */
  const retry = useCallback(() => {
    setLoadState({ phase: "loading" });
    void refresh({ isPoll: false });
  }, [refresh]);

  /** Fetches the page before the oldest shown message; rejects on failure. */
  const loadEarlier = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest) {
      return;
    }
    const page = await api.listTelegramMessages(userId, { before: oldest.id });
    hasLoadedEarlierRef.current = true;
    setEarlierMessages((previous) => [...page.messages, ...previous]);
    setHasEarlier(page.hasMore);
  }, [messages, userId]);

  /** Shows a just-sent entry immediately; any in-flight refresh started earlier is now stale. */
  const appendSent = useCallback((message: TelegramMessage) => {
    latestRequestRef.current++;
    setRecentMessages((previous) => [...previous, message]);
  }, []);

  /** After a successful delete (AC-22). */
  const clearMessages = useCallback(() => {
    latestRequestRef.current++;
    setRecentMessages([]);
    setEarlierMessages([]);
    setHasEarlier(false);
    hasLoadedEarlierRef.current = false;
  }, []);

  /** Takes the status returned alongside a freshly generated invitation. */
  const updateStatus = setStatusInfo;

  return {
    statusInfo,
    messages,
    hasEarlier,
    loadState,
    refresh,
    retry,
    loadEarlier,
    appendSent,
    clearMessages,
    updateStatus,
  };
}
