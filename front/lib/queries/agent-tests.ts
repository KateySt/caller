import { queryOptions } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { clearAdminSecret } from "@/lib/admin-secret";

/** How often an in-progress test session's status/transcript is re-fetched (front SPEC-05 AC-26). */
export const AGENT_TEST_POLL_INTERVAL_MS = 3000;

/** Token-free keys: keys are serialised into devtools and error reports, so the secret never goes in one. */
export const agentTestKeys = {
  all: () => ["agent-tests"] as const,
  list: () => [...agentTestKeys.all(), "list"] as const,
  detail: (id: string) => [...agentTestKeys.all(), "detail", id] as const,
};

/**
 * A 401 means the stored secret is wrong or stale (front SPEC-05 AC-5). Forgetting it at the
 * moment the request fails — not from cached error state later — means a freshly entered valid
 * secret can never be wiped by a stale cached 401. Retries skip 4xx, so this runs once.
 */
export async function withUnauthorizedReset<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAdminSecret();
    }
    throw error;
  }
}

// The admin token is captured by each `queryFn` closure and deliberately kept out of the keys.
export const agentTestQueries = {
  all: agentTestKeys.all,
  list: (adminToken: string) =>
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- the secret must never be in a key
    queryOptions({
      queryKey: agentTestKeys.list(),
      queryFn: ({ signal }) =>
        withUnauthorizedReset(api.listAgentTestSessions(adminToken, { signal })),
      // Rows of a running test keep refreshing until it ends (front SPEC-05 AC-26).
      refetchInterval: (query) =>
        query.state.data?.some((session) => session.status === "in_progress")
          ? AGENT_TEST_POLL_INTERVAL_MS
          : false,
    }),
  detail: (id: string, adminToken: string) =>
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- the secret must never be in a key
    queryOptions({
      queryKey: agentTestKeys.detail(id),
      queryFn: ({ signal }) =>
        withUnauthorizedReset(api.getAgentTestSession(id, adminToken, { signal })),
      refetchInterval: (query) =>
        query.state.data?.status === "in_progress" ? AGENT_TEST_POLL_INTERVAL_MS : false,
    }),
};
