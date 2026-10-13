"use client";

import Link from "next/link";
import { AdminSecretGate } from "@/components/admin-secret-gate";
import { AgentTestBadge } from "@/components/agent-test-badge";
import { Button } from "@/components/ui/button";
import { useAgentTestSessions } from "@/hooks/use-agent-tests";
import { agentTestStatusLabel, describeAgentTestEnd } from "@/lib/agent-test-format";
import type { AgentTestSessionSummary } from "@/lib/api";
import { formatDate, formatDurationSeconds } from "@/lib/date";

/** Test-session history, newest first (front SPEC-05 AC-24, AC-27, AC-28). */
export function AgentTestHistory() {
  return (
    <AdminSecretGate>
      <HistoryList />
    </AdminSecretGate>
  );
}

function HistoryList() {
  const { data, isPending, isError, refetch, isRefetching } = useAgentTestSessions();

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading test sessions…</p>;
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="grid gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive"
      >
        <p>Could not load the test history.</p>
        <div>
          <Button type="button" variant="outline" size="sm" disabled={isRefetching} onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No test sessions yet. Start one from the Agent Settings page.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {data.map((session) => (
        <li key={session.id}>
          <SessionRow session={session} />
        </li>
      ))}
    </ul>
  );
}

function SessionRow({ session }: { session: AgentTestSessionSummary }) {
  const end = describeAgentTestEnd(session);

  return (
    <Link
      href={`/agent-tests/${encodeURIComponent(session.id)}`}
      className="grid gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AgentTestBadge>Test</AgentTestBadge>
          <AgentTestBadge>{session.promptSource === "saved" ? "Saved prompt" : "Draft prompt"}</AgentTestBadge>
          <AgentTestBadge>{agentTestStatusLabel(session.status)}</AgentTestBadge>
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(session.startedAt)}</span>
      </div>

      <p className={`text-sm ${session.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
        {end ?? "Waiting for the session to end…"}
        {session.durationSeconds !== null && ` · ${formatDurationSeconds(session.durationSeconds)}`}
      </p>

      <p className="line-clamp-2 text-sm whitespace-pre-wrap">{session.promptPreview}</p>
    </Link>
  );
}
