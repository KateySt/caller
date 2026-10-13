"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `window.isSecureContext` (HTTPS or localhost), which browsers require for microphone access
 * (front SPEC-05 AC-23). Assumed `true` on the server so nothing flashes during hydration.
 */
export function useIsSecureContext(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.isSecureContext,
    () => true,
  );
}
