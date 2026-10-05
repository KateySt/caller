"use client";

import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { api, type Call } from "@/lib/api";
import { callQueries } from "@/lib/queries/calls";

/**
 * Calls the operator placed this session, by user id. Which call to follow is UI state; the
 * call itself is server state — `callQueries.detail` polls it until it ends, so a user's
 * "in progress" lock survives the dialog closing (front SPEC-02 AC-2, AC-3).
 */
export function useTrackedCalls() {
  const queryClient = useQueryClient();
  const [trackedCallIds, setTrackedCallIds] = useState<Record<string, string>>({});

  const trackedEntries = Object.entries(trackedCallIds);
  const callsByUserId = useQueries({
    queries: trackedEntries.map(([userId, callId]) => callQueries.detail(userId, callId)),
    combine: (results): Record<string, Call> =>
      Object.fromEntries(
        trackedEntries.flatMap(([userId], index) => {
          const call = results[index]?.data;
          return call ? [[userId, call]] : [];
        }),
      ),
  });

  const placeCall = useMutation({
    mutationFn: (userId: string) => api.placeCall(userId),
    onSuccess: (call, userId) => {
      // Seed the cache so the dialog opens with the call already in hand.
      queryClient.setQueryData(callQueries.detail(userId, call.id).queryKey, call);
      setTrackedCallIds((previous) => ({ ...previous, [userId]: call.id }));
    },
  });

  return {
    callsByUserId,
    placeCall,
    /** The user whose call is being placed right now, if any. */
    startingCallFor: placeCall.isPending ? placeCall.variables : null,
  };
}
