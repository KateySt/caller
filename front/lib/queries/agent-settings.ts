import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const agentSettingsQueries = {
  detail: () =>
    queryOptions({
      queryKey: ["agent-settings"] as const,
      queryFn: ({ signal }) => api.getAgentSettings({ signal }),
    }),
};
