"use client";

import Link from "next/link";
import { AdminSecretGate } from "@/components/admin-secret-gate";
import { AgentTestBadge } from "@/components/agent-test-badge";
import { AgentTestTranscript } from "@/components/agent-test-panel-transcript";
import { Button } from "@/components/ui/button";
import { useAgentTestSession } from "@/hooks/use-agent-tests";
import { agentTestSpeaker, agentTestStatusLabel, describeAgentTestEnd } from "@/lib/agent-test-format";
import { ApiError } from "@/lib/api";
import { formatDate, formatDurationSeconds } from "@/lib/date";

/** One test session: full prompt, labels, timestamps and transcript (front SPEC-05 AC-25, AC-26). */
export function AgentTestDetail({ id }: { id: string }) {
  return (
    <AdminSecretGate>
      <DetailBody id={id} />
    </AdminSecretGate>
  );
}

function DetailBody({ id }: { id: string }) {
  const { data: session, isPending, isError, error, refetch, isRefetching } = useAgentTestSession(id);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading test session…</p>;
  }

  if (isError) {
    // A malformed (non-UUID) id is rejected with 400 — for the admin that is also "not found".
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div
        role="alert"
        className="grid gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive"
      >
        <p>{notFound ? "This test session was not found." : "Could not load this test session."}</p>
        {!notFound && (
          <div>
            <Button type="button" variant="outline" size="sm" disabled={isRefetching} onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        <Link href="/agent-tests" className="underline underline-offset-4">
          Back to test history
        </Link>
      </div>
    );
  }

  const end = describeAgentTestEnd(session);
  const lines = session.transcript.map((turn, index) => ({
    key: `${index}-${turn.at}`,
    speaker: agentTestSpeaker(turn.role),
    text: turn.text,
  }));

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AgentTestBadge>Test</AgentTestBadge>
          <AgentTestBadge>{session.promptSource === "saved" ? "Saved prompt" : "Draft prompt"}</AgentTestBadge>
          <AgentTestBadge>{agentTestStatusLabel(session.status)}</AgentTestBadge>
        </div>
        <p className={`text-sm ${session.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
          {end ?? "Waiting for the session to end…"}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Started</dt>
          <dd>{formatDate(session.startedAt)}</dd>
          <dt className="text-muted-foreground">Ended</dt>
          <dd>{formatDate(session.endedAt)}</dd>
          <dt className="text-muted-foreground">Duration</dt>
          <dd>{session.durationSeconds !== null ? formatDurationSeconds(session.durationSeconds) : "—"}</dd>
        </dl>
      </div>

      <section className="grid gap-2">
        <h2 className="text-sm font-medium">System prompt</h2>
        <p className="max-h-64 overflow-y-auto rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
          {session.systemPrompt}
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Transcript</h2>
        <AgentTestTranscript lines={lines} emptyText="No conversation was recorded." />
      </section>
    </div>
  );
}
