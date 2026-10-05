"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CreateUserInput, type UpdateUserInput } from "@/lib/api";
import { userQueries } from "@/lib/queries/users";

// Both return the invalidation, so `isPending` lasts until the list has refetched and the
// dialog closes onto an already-updated list.

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateUserInput) => api.createUser(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userQueries.all() }),
  });
}

export function useUpdateUser(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateUserInput) => api.updateUser(userId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userQueries.all() }),
  });
}
