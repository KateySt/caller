"use client";

import { useMemo } from "react";
import {
  useSessionMessages,
  type UseAgentReturn,
  type UseSessionReturn,
} from "@livekit/components-react";
import type { MediaDeviceFailure, Track } from "livekit-client";
import { AgentAudioVisualizerBar } from "@/components/agent-audio-visualizer-bar";
import { AgentControlBar } from "@/components/agent-control-bar";
import { StartAudioButton } from "@/components/start-audio-button";
import { Button } from "@/components/ui/button";
import {
  AgentTestTranscript,
  type AgentTestTranscriptLine,
} from "@/components/agent-test-panel-transcript";
import { describeMicrophoneFailure } from "@/lib/agent-test-format";

interface AgentTestLiveViewProps {
  session: UseSessionReturn;
  /** From the panel's single `useAgent(session)`, which also drives its status line. */
  agent: UseAgentReturn;
  micFailure: MediaDeviceFailure | null;
  isEnding: boolean;
  onDisconnect: () => void;
  onDeviceError: (error: { source: Track.Source; error: Error }) => void;
}

/** Connecting/live part of the test panel (front SPEC-05 AC-13..AC-17). Must sit inside `AgentSessionProvider`. */
export function AgentTestLiveView({
  session,
  agent,
  micFailure,
  isEnding,
  onDisconnect,
  onDeviceError,
}: AgentTestLiveViewProps) {
  const { messages } = useSessionMessages(session);

  const lines = useMemo<AgentTestTranscriptLine[]>(
    () =>
      messages.map((message) => ({
        key: message.id,
        speaker: message.type === "userTranscript" || message.from?.isLocal ? "You" : "Agent",
        text: message.message,
      })),
    [messages],
  );

  return (
    <div className="grid gap-4">
      {agent.state === "failed" && (
        // Review Focus 3: the agent worker never joined; "End test" below still works.
        <div role="alert" className="grid gap-1 text-sm text-destructive">
          <p>Agent did not join — it may need redeploying.</p>
          {agent.failureReasons.map((reason) => (
            <p key={reason} className="text-xs">
              {reason}
            </p>
          ))}
        </div>
      )}

      {micFailure !== null && (
        <p role="alert" className="text-sm text-destructive">
          {describeMicrophoneFailure(micFailure)}
        </p>
      )}

      <div className="flex flex-col items-center gap-2 rounded-lg border py-4">
        <AgentAudioVisualizerBar
          size="sm"
          state={agent.state}
          audioTrack={agent.microphoneTrack}
        />
        <p className="text-xs text-muted-foreground">{describeAgentState(agent.state)}</p>
        {/* Only visible while the browser blocks autoplay (AC-16). */}
        <StartAudioButton label="Allow agent audio" variant="outline" size="sm" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AgentControlBar
          variant="outline"
          // Microphone only: no camera, screen share or typed chat (AC-13/14). Leave is our own
          // button below, because the stock one ends the room before the backend is told.
          controls={{ microphone: true, camera: false, screenShare: false, chat: false, leave: false }}
          saveUserChoices={false}
          isConnected={session.isConnected}
          onDeviceError={onDeviceError}
          className="grow"
        />
        <Button type="button" variant="destructive" disabled={isEnding} onClick={onDisconnect}>
          {isEnding ? "Ending…" : "End test"}
        </Button>
      </div>

      <AgentTestTranscript
        lines={lines}
        emptyText={
          session.isConnected
            ? "Say hello — the conversation appears here."
            : "Connecting to the test room…"
        }
      />
    </div>
  );
}

function describeAgentState(state: UseAgentReturn["state"]): string {
  switch (state) {
    case "listening":
      return "Agent is listening";
    case "thinking":
      return "Agent is thinking";
    case "speaking":
      return "Agent is speaking";
    case "failed":
      return "Agent unavailable";
    case "disconnected":
      return "Agent disconnected";
    default:
      return "Waiting for the agent to join…";
  }
}
