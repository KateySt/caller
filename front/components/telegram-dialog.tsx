"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TelegramComposer } from "@/components/telegram-composer";
import { TelegramConversationLog } from "@/components/telegram-conversation-log";
import { TelegramInvitePanel } from "@/components/telegram-invite-panel";
import { useTelegramConversation } from "@/hooks/use-telegram-conversation";
import { api, type TelegramStatus, type User } from "@/lib/api";

const EMPTY_HISTORY_TEXT: Record<TelegramStatus, string> = {
  not_linked:
    "No messages yet. Generate a link and send it to the client; the conversation appears once they open it.",
  linked: "No messages yet.",
  opted_out: "No messages yet.",
  unreachable: "No messages yet.",
};

interface TelegramDialogProps {
  user: User;
  /** Id of the row button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Operator view of one contact's Telegram bot conversation (front SPEC-03). Mounted only
 * while open by `UsersList`, so every open starts from a clean state (AC-19). Server state
 * lives in `useTelegramConversation`, the message form in `TelegramComposer`.
 */
export function TelegramDialog({ user, triggerId, onClose }: TelegramDialogProps) {
  const conversation = useTelegramConversation(user.id);
  const { statusInfo, messages, loadState } = conversation;

  const [isSending, setIsSending] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isBusy = isSending || isDeleting;

  function handleOpenChange(open: boolean) {
    if (!open && !isBusy) {
      onClose();
    }
  }

  async function deleteHistory() {
    setIsConfirmingDelete(false);
    setIsDeleting(true);
    try {
      await api.deleteTelegramMessages(user.id);
      conversation.clearMessages();
      toast.success("Conversation history deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the history.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isBusy} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Telegram: {user.name}</DialogTitle>
          <DialogDescription>
            Conversation between {user.name} and the bot. Messages are shown as plain text.
          </DialogDescription>
        </DialogHeader>

        {loadState.phase === "loading" && (
          <p role="status" className="py-8 text-center text-muted-foreground">
            Loading Telegram status and messages…
          </p>
        )}

        {loadState.phase === "error" && (
          <div role="alert" className="grid gap-3 rounded-lg border border-destructive/40 p-4">
            <p className="text-destructive">{loadState.message}</p>
            <div>
              <Button variant="outline" size="sm" onClick={conversation.retry}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {loadState.phase === "ready" && statusInfo && (
          <>
            <TelegramInvitePanel
              userId={user.id}
              statusInfo={statusInfo}
              onStatusChange={conversation.updateStatus}
            />

            <TelegramConversationLog
              messages={messages}
              hasEarlier={conversation.hasEarlier}
              emptyText={EMPTY_HISTORY_TEXT[statusInfo.status]}
              onLoadEarlier={conversation.loadEarlier}
            />

            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={messages.length === 0 || isBusy}
                onClick={() => setIsConfirmingDelete(true)}
              >
                <Trash2Icon />
                Delete history
              </Button>
            </div>

            {isConfirmingDelete && (
              <div
                role="group"
                aria-label="Confirm history deletion"
                className="grid gap-2 rounded-lg border border-destructive/40 p-3"
              >
                <p>
                  All logged Telegram messages with {user.name} will be permanently deleted. The
                  contact&apos;s link status is not changed.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => void deleteHistory()}>
                    Delete permanently
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    autoFocus
                    onClick={() => setIsConfirmingDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <TelegramComposer
              userId={user.id}
              status={statusInfo.status}
              onSent={conversation.appendSent}
              onSendFailed={() => void conversation.refresh({ isPoll: false })}
              onSubmittingChange={setIsSending}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
