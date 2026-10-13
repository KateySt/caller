import { useSyncExternalStore } from "react";

/** sessionStorage key for the shared admin secret (front SPEC-05 AC-2). Tab-scoped, never persisted. */
const STORAGE_KEY = "caller.adminDebugToken";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAdminSecret(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (privacy mode); behave as "no secret".
    return null;
  }
}

export function setAdminSecret(value: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore: without storage the secret simply can't be remembered.
  }
  notify();
}

export function clearAdminSecret(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore, as above.
  }
  notify();
}

/** The current admin secret, or `null` on the server and before one is entered. */
export function useAdminSecret(): string | null {
  return useSyncExternalStore(subscribe, getAdminSecret, () => null);
}
