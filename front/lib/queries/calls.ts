import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** How often an in-progress call's status/transcript is re-fetched (front SPEC-02 NFR). */
export const CALL_POLL_INTERVAL_MS = 2500;

export const callQueries = {
  all: () => ["calls"] as const,
  detail: (userId: string, callId: string) =>
    queryOptions({
      queryKey: [...callQueries.all(), userId, callId] as const,
      queryFn: ({ signal }) => api.getCall(userId, callId, { signal }),
      // Polls until the call reaches a terminal state, then stops by itself.
      refetchInterval: (query) =>
        query.state.data?.status === "in_progress" ? CALL_POLL_INTERVAL_MS : false,
    }),
};
