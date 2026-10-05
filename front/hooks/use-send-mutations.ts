"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Nothing in the client cache depends on a sent message (the activity timeline is a
// Server Component and re-renders on navigation), so there is no cache work to do here.

export function useSendWhatsAppMessage(userId: string) {
  return useMutation({ mutationFn: (body: string) => api.sendMessage(userId, body) });
}

export function useSendSms(userId: string) {
  return useMutation({ mutationFn: (body: string) => api.sendSms(userId, body) });
}
