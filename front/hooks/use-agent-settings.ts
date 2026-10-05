"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { agentSettingsQueries } from "@/lib/queries/agent-settings";

/** Hydrated by the home page's Server Component, so `data` is always present on first render. */
export function useAgentSettings() {
  return useSuspenseQuery(agentSettingsQueries.detail());
}

export function useUpdateAgentSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (systemPrompt: string) => api.updateAgentSettings(systemPrompt),
    onSuccess: (updated) => {
      queryClient.setQueryData(agentSettingsQueries.detail().queryKey, updated);
    },
  });
}
