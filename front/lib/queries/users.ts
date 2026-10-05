import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const userQueries = {
  all: () => ["users"] as const,
  list: () =>
    queryOptions({
      queryKey: [...userQueries.all(), "list"] as const,
      queryFn: ({ signal }) => api.listUsers({ signal }),
    }),
};
