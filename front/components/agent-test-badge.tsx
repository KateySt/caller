import type { ReactNode } from "react";

/** Small label pill used on the test-history rows and detail. */
export function AgentTestBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}
