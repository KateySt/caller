"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TelegramMessage } from "@/lib/api";

function formatTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString();
}

interface TelegramConversationLogProps {
  messages: TelegramMessage[];
  hasEarlier: boolean;
  emptyText: string;
  /** Rejects on failure; the log shows the toast. */
  onLoadEarlier: () => Promise<void>;
}

/** Chat-style history, oldest first (front SPEC-03 AC-8..10). Never steals focus. */
export function TelegramConversationLog({
  messages,
  hasEarlier,
  emptyText,
  onLoadEarlier,
}: TelegramConversationLogProps) {
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Follow new messages only when the operator is already at the bottom.
  useEffect(() => {
    const container = containerRef.current;
    if (container && isNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    isNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  async function loadEarlier() {
    const container = containerRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    isNearBottomRef.current = false;
    setIsLoadingEarlier(true);
    try {
      await onLoadEarlier();
      // Keep the message the operator was reading in place after older ones are prepended.
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop += container.scrollHeight - previousHeight;
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load earlier messages.");
    } finally {
      setIsLoadingEarlier(false);
    }
  }

  return (
    <div
      ref={containerRef}
      role="log"
      aria-label="Telegram conversation"
      aria-live="polite"
      tabIndex={0}
      onScroll={handleScroll}
      className="grid max-h-80 min-h-32 content-start gap-2 overflow-y-auto rounded-lg border p-3"
    >
      {hasEarlier && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-center"
          disabled={isLoadingEarlier}
          onClick={() => void loadEarlier()}
        >
          {isLoadingEarlier ? "Loading…" : "Load earlier messages"}
        </Button>
      )}
      {messages.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">{emptyText}</p>
      ) : (
        messages.map((message) => <MessageBubble key={message.id} message={message} />)
      )}
    </div>
  );
}

/** Direction is shown by alignment *and* an explicit label, never by colour alone (AC-8). */
function MessageBubble({ message }: { message: TelegramMessage }) {
  const isInbound = message.direction === "inbound";

  return (
    <div className={isInbound ? "justify-self-start" : "justify-self-end"}>
      <div
        className={
          isInbound
            ? "max-w-[85%] rounded-lg border bg-muted px-3 py-2"
            : "max-w-[85%] rounded-lg border bg-primary/10 px-3 py-2"
        }
      >
        <p className="text-xs font-medium text-muted-foreground">
          {isInbound ? "Client" : "Bot"} · {formatTimestamp(message.occurredAt)}
        </p>
        {message.text !== null ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : (
          <p className="italic text-muted-foreground">{message.contentType} (not shown)</p>
        )}
        {message.status === "failed" && (
          <p className="text-xs font-medium text-destructive">
            Failed{message.failureReason ? `: ${message.failureReason}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
