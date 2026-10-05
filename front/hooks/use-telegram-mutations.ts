"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type TelegramMessagePage } from "@/lib/api";
import { telegramQueries } from "@/lib/queries/telegram";

/** The returned `data` holds the raw link — shown once, discarded with the component. */
export function useCreateTelegramInvite(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.createTelegramInvite(userId),
    onSuccess: (created) => {
      queryClient.setQueryData(telegramQueries.status(userId).queryKey, created.status);
    },
  });
}

export function useSendTelegramMessage(userId: string) {
  const queryClient = useQueryClient();
  const messagesKey = telegramQueries.recentMessages(userId).queryKey;

  return useMutation({
    mutationFn: (text: string) => api.sendTelegramMessage(userId, text),
    onSuccess: async (message) => {
      // An in-flight poll started before the send would overwrite the appended message.
      await queryClient.cancelQueries({ queryKey: messagesKey });
      queryClient.setQueryData<TelegramMessagePage>(messagesKey, (page) =>
        page ? { ...page, messages: [...page.messages, message] } : page,
      );
    },
    // Success or failure, re-sync status and history (a failed send can mean the contact
    // blocked the bot — AC-17). Not returned: the UI doesn't wait on it.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: telegramQueries.all(userId) });
    },
  });
}

export function useDeleteTelegramMessages(userId: string) {
  const queryClient = useQueryClient();
  const messagesKey = telegramQueries.recentMessages(userId).queryKey;

  return useMutation({
    mutationFn: () => api.deleteTelegramMessages(userId),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      queryClient.setQueryData<TelegramMessagePage>(messagesKey, { messages: [], hasMore: false });
    },
  });
}
