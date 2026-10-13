"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useAgent, useSession } from "@livekit/components-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ConnectionError,
  ConnectionState,
  DisconnectReason,
  MediaDeviceFailure,
  RoomEvent,
  Track,
  TokenSource,
  type LocalTrackPublication,
} from "livekit-client";
import { AgentSessionProvider } from "@/components/agent-session-provider";
import { AgentTestLiveView } from "@/components/agent-test-panel-live";
import { AgentTestEndedView, type AgentTestRoomOutcome } from "@/components/agent-test-panel-ended";
import { useAgentTestSession, useEndAgentTestSession } from "@/hooks/use-agent-tests";
import { useIsSecureContext } from "@/hooks/use-is-secure-context";
import type { CreatedAgentTestSession } from "@/lib/api";
import { agentTestKeys } from "@/lib/queries/agent-tests";

/** After a drop we wait for the backend to close the session before unlocking; this caps the wait. */
const RELEASE_FALLBACK_MS = 15_000;
/** One extra detail fetch this long after the session ends, to catch late final transcript turns. */
const FINAL_TRANSCRIPT_REFETCH_MS = 2_500;
/**
 * How long to wait for the agent before showing "did not join". The Cloud agent scales to zero, and
 * a cold start alone takes ~15–20 s — the SDK's 20 s default fails a healthy agent.
 */
const AGENT_JOIN_TIMEOUT_MS = 60_000;

interface AgentTestPanelProps {
  created: CreatedAgentTestSession;
  /** The session is over and closed server-side — the parent unlocks the prompt form (AC-10). */
  onEnded: () => void;
  /** "Start new test" in the ended state. */
  onStartNew: () => void;
}

/**
 * Inline live view of one browser test session (front SPEC-05 AC-13..AC-23). Mount it with
 * `key={created.session.id}`: each session gets its own Room, and an ended one is never reused.
 */
export function AgentTestPanel({ created, onEnded, onStartNew }: AgentTestPanelProps) {
  const sessionId = created.session.id;
  const isSecure = useIsSecureContext();
  const queryClient = useQueryClient();
  const tokenSource = useMemo(
    () =>
      TokenSource.literal({
        serverUrl: created.server_url,
        participantToken: created.participant_token,
      }),
    [created.server_url, created.participant_token],
  );
  // No `agentName`: the backend has already dispatched the test agent into this room.
  const session = useSession(tokenSource, { agentConnectTimeoutMilliseconds: AGENT_JOIN_TIMEOUT_MS });
  const agent = useAgent(session);
  const { room } = session;
  // The backend is the source of truth for the end reason and final transcript; polled while in progress.
  const { data: detail = created.session } = useAgentTestSession(sessionId);
  const endTest = useEndAgentTestSession();

  const [roomOutcome, setRoomOutcome] = useState<AgentTestRoomOutcome | null>(null);
  const [micFailure, setMicFailure] = useState<MediaDeviceFailure | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [releaseFallbackElapsed, setReleaseFallbackElapsed] = useState(false);
  // Read only from event handlers: we're closing the room on purpose / start() hasn't settled yet.
  const intentionalCloseRef = useRef(false);
  const startPendingRef = useRef(false);

  const settle = (next: AgentTestRoomOutcome) => setRoomOutcome((previous) => previous ?? next);

  /** Review Focus 2: tell the backend first, then leave the room. */
  const endAndLeave = async () => {
    intentionalCloseRef.current = true;
    try {
      await endTest.mutateAsync(sessionId);
    } catch {
      // Surfaced via `endTest.error`; leave the room regardless.
    }
    await session.end();
  };

  const disconnect = async () => {
    if (isEnding) return;
    setIsEnding(true);
    await endAndLeave();
    settle({ kind: "closed", cause: "intentional" });
  };

  const startRoom = useEffectEvent(async (isDisposed: () => boolean) => {
    if (!isSecure) {
      // AC-23: don't attempt to connect; close the server-side session we just created.
      settle({ kind: "insecure" });
      endTest.mutate(sessionId);
      return;
    }

    startPendingRef.current = true;
    try {
      // Microphone only (AC-14). No pre-connect buffer: it is sent over a data stream, and the
      // test token deliberately has `canPublishData: false` (back SPEC-06 AC-10).
      await session.start({
        tracks: { microphone: { enabled: true, publishOptions: { preConnectBuffer: false } } },
      });
      startPendingRef.current = false;
    } catch (error) {
      startPendingRef.current = false;
      if (isDisposed()) return;
      if (intentionalCloseRef.current) {
        // "End test" (or the backend ending the session) cancelled the connection attempt.
        settle({ kind: "closed", cause: "intentional" });
        return;
      }
      if (error instanceof ConnectionError) {
        settle({ kind: "connect-failed", message: error.message });
      } else {
        // AC-15: don't stay "connected" without a working mic — explain how to allow it.
        settle({
          kind: "mic-failed",
          failure: MediaDeviceFailure.getFailure(error) ?? MediaDeviceFailure.Other,
        });
      }
      await endAndLeave();
    }
  });

  const leaveRoom = useEffectEvent(() => session.end());

  const handleRoomClosed = useEffectEvent((reason?: DisconnectReason) => {
    // A failed connect also emits Disconnected before start() rejects; the start() catch
    // classifies that one (connect vs mic failure).
    if (startPendingRef.current) return;
    if (intentionalCloseRef.current) {
      settle({ kind: "closed", cause: "intentional" });
    } else if (reason === DisconnectReason.ROOM_DELETED) {
      // The backend deletes the room as soon as it ends the session: fetch its end reason now
      // rather than on the next 3 s poll.
      settle({ kind: "closed", cause: "server" });
      void queryClient.invalidateQueries({ queryKey: agentTestKeys.detail(sessionId) });
    } else {
      // AC-21: an unplanned drop ends the view; the token is never reused to reconnect.
      settle({ kind: "closed", cause: "lost" });
    }
  });

  const recordMicFailure = (error: Error) => {
    setMicFailure(MediaDeviceFailure.getFailure(error) ?? MediaDeviceFailure.Other);
  };

  const handleMediaDevicesError = useEffectEvent(recordMicFailure);

  const handleLocalTrackPublished = useEffectEvent((publication: LocalTrackPublication) => {
    if (publication.source === Track.Source.Microphone) setMicFailure(null);
  });

  useEffect(() => {
    let disposed = false;
    const onDisconnected = (reason?: DisconnectReason) => handleRoomClosed(reason);
    const onMediaDevicesError = (error: Error) => handleMediaDevicesError(error);
    const onLocalTrackPublished = (publication: LocalTrackPublication) =>
      handleLocalTrackPublished(publication);

    room
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.MediaDevicesError, onMediaDevicesError)
      .on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);

    // Deferred a tick so React Strict Mode's dev-only mount→unmount→mount connects once.
    const timer = window.setTimeout(() => void startRoom(() => disposed), 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      room
        .off(RoomEvent.Disconnected, onDisconnected)
        .off(RoomEvent.MediaDevicesError, onMediaDevicesError)
        .off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
      // AC-19: unmount / navigation leaves the room (the agent reports `admin_disconnected`).
      // Tab close is covered by livekit-client's own `pagehide`/`beforeunload` disconnect.
      void leaveRoom();
    };
  }, [room]);

  // The backend ended the session (agent finished, silence, max duration, failure): leave too.
  const endedByBackend = detail.status !== "in_progress";
  useEffect(() => {
    if (!endedByBackend) return;
    intentionalCloseRef.current = true;
    void leaveRoom();
  }, [endedByBackend]);
  // A backend end while start() is still pending (e.g. during the mic prompt) emits no room
  // outcome, so derive one — otherwise the panel would stay on "Connecting…" with the form locked.
  const outcome: AgentTestRoomOutcome | null =
    roomOutcome ?? (endedByBackend ? { kind: "closed", cause: "server" } : null);

  // The agent's last transcript turns can land just after the session turns terminal (and
  // polling stops): refetch the detail once more shortly after.
  const refetchFinalDetail = useEffectEvent(() => {
    void queryClient.invalidateQueries({ queryKey: agentTestKeys.detail(sessionId) });
  });
  useEffect(() => {
    if (!endedByBackend) return;
    const timer = window.setTimeout(refetchFinalDetail, FINAL_TRANSCRIPT_REFETCH_MS);
    return () => window.clearTimeout(timer);
  }, [endedByBackend]);

  // Unlock the form (and "Start new test") only once the backend has the session closed — our
  // end request finished, or it reports the end itself — so a quick restart can't hit the
  // one-active-session 409. A drop the backend never reports is released after a fallback delay.
  const waitingForBackendOnly = outcome?.kind === "closed" && outcome.cause !== "intentional";
  useEffect(() => {
    if (!waitingForBackendOnly || endedByBackend) return;
    const timer = window.setTimeout(() => setReleaseFallbackElapsed(true), RELEASE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForBackendOnly, endedByBackend]);

  const endRequestSettled = endTest.isSuccess || endTest.isError;
  const released =
    outcome !== null && (endedByBackend || endRequestSettled || releaseFallbackElapsed);

  const notifyEnded = useEffectEvent(() => onEnded());
  useEffect(() => {
    if (released) notifyEnded();
  }, [released]);

  const statusText = outcome
    ? "Ended"
    : session.connectionState === ConnectionState.Reconnecting ||
        session.connectionState === ConnectionState.SignalReconnecting
      ? "Reconnecting…"
      : !session.isConnected
        ? "Connecting…"
        : agent.state === "failed"
          ? "Agent unavailable"
          : micFailure !== null
            ? "Microphone unavailable"
            : "Live";

  return (
    <AgentSessionProvider session={session}>
      <div className="grid gap-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold">Live test</h3>
          <p role="status" className="text-sm text-muted-foreground">
            {statusText}
          </p>
        </div>

        {created.session.promptSource === "draft" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">Using unsaved draft prompt</p>
        )}

        {outcome ? (
          <AgentTestEndedView
            outcome={outcome}
            detail={detail}
            endError={endTest.error}
            canStartNew={released}
            onStartNew={onStartNew}
          />
        ) : (
          <AgentTestLiveView
            session={session}
            agent={agent}
            micFailure={micFailure}
            isEnding={isEnding}
            onDisconnect={() => void disconnect()}
            onDeviceError={({ error }) => recordMicFailure(error)}
          />
        )}
      </div>
    </AgentSessionProvider>
  );
}
