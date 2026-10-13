"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAdminSecret } from "@/lib/admin-secret";
import {
  agentTestKeys,
  agentTestQueries,
  withUnauthorizedReset,
} from "@/lib/queries/agent-tests";

/** History list (newest first). Disabled until the admin secret is entered. */
export function useAgentTestSessions() {
  const token = useAdminSecret();
  return useQuery({
    ...agentTestQueries.list(token ?? ""),
    enabled: !!token,
  });
}

/** One session, polled every 3 s while it is `in_progress` (front SPEC-05 AC-26). */
export function useAgentTestSession(id: string | null | undefined) {
  const token = useAdminSecret();
  return useQuery({
    ...agentTestQueries.detail(id ?? "", token ?? ""),
    enabled: !!token && !!id,
  });
}

export function useCreateAgentTestSession() {
  const queryClient = useQueryClient();
  const token = useAdminSecret();

  return useMutation({
    mutationFn: (systemPrompt: string) => {
      if (!token) throw new ApiError("Enter the admin key first.", 401);
      return withUnauthorizedReset(api.createAgentTestSession(systemPrompt, token));
    },
    onSuccess: ({ session }) => {
      // Seed the detail so the live panel renders immediately, then refresh the history list.
      queryClient.setQueryData(agentTestKeys.detail(session.id), session);
      void queryClient.invalidateQueries({ queryKey: agentTestKeys.list() });
    },
  });
}

export function useEndAgentTestSession() {
  const queryClient = useQueryClient();
  const token = useAdminSecret();

  return useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new ApiError("Enter the admin key first.", 401);
      return withUnauthorizedReset(api.endAgentTestSession(id, token));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentTestQueries.all() }),
  });
}
