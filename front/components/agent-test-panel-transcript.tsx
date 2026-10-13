"use client";

import { useEffect, useRef } from "react";

export interface AgentTestTranscriptLine {
  key: string;
  speaker: "You" | "Agent";
  text: string;
}

interface AgentTestTranscriptProps {
  lines: AgentTestTranscriptLine[];
  emptyText: string;
}

/**
 * Test-session transcript, rendered as plain React text nodes only (front SPEC-05 AC-22) — the
 * text comes from speech recognition and an LLM, so it is never parsed as markdown or HTML.
 * A labelled `log` region: announced politely, never takes focus.
 */
export function AgentTestTranscript({ lines, emptyText }: AgentTestTranscriptProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={viewportRef}
      role="log"
      aria-label="Test transcript"
      className="max-h-96 min-h-24 overflow-y-auto rounded-lg border p-3"
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="grid gap-2">
          {lines.map((line) => (
            <li key={line.key} className="grid gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">{line.speaker}</span>
              <p
                className={
                  line.speaker === "You"
                    ? "rounded-lg bg-secondary px-3 py-2 text-sm whitespace-pre-wrap"
                    : "rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {line.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
