"use client";

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BotMessageSquareIcon,
  MessageSquareIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CallDialog } from "@/components/call-dialog";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { EditUserDialog } from "@/components/edit-user-dialog";
import { SendMessageDialog } from "@/components/send-message-dialog";
import { SendSmsDialog } from "@/components/send-sms-dialog";
import { TelegramDialog } from "@/components/telegram-dialog";
import { useTrackedCalls } from "@/hooks/use-calls";
import type { User } from "@/lib/api";
import { userQueries } from "@/lib/queries/users";

const CREATE_TRIGGER_ID = "create-user-trigger";
const messageTriggerId = (userId: string) => `message-trigger-${userId}`;
const smsTriggerId = (userId: string) => `sms-trigger-${userId}`;
const telegramTriggerId = (userId: string) => `telegram-trigger-${userId}`;
const editTriggerId = (userId: string) => `edit-trigger-${userId}`;
const callTriggerId = (userId: string) => `call-trigger-${userId}`;

/** Hydrated by the users page's Server Component; create/edit invalidate it, so it refetches. */
export function UsersList() {
  const { data: users } = useSuspenseQuery(userQueries.list());

  // The dialogs are lifted above the rows: picking another contact replaces the
  // open one instead of stacking a second dialog on top of it.
  const [isCreating, setIsCreating] = useState(false);
  const [messageTarget, setMessageTarget] = useState<User | null>(null);
  const [smsTarget, setSmsTarget] = useState<User | null>(null);
  const [telegramTarget, setTelegramTarget] = useState<User | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  // Calls are tracked by user id here (not inside the dialog) so a user's "in progress"
  // lock on the Call button survives the dialog being closed (front SPEC-02 AC-2, AC-3).
  const { callsByUserId: calls, placeCall, startingCallFor } = useTrackedCalls();
  const [callDialogUserId, setCallDialogUserId] = useState<string | null>(null);

  async function handleStartCall(user: User) {
    try {
      await placeCall.mutateAsync(user.id);
      setCallDialogUserId(user.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the call.");
    }
  }

  const callDialogTarget = callDialogUserId
    ? users.find((user) => user.id === callDialogUserId)
    : undefined;
  const callDialogCall = callDialogUserId ? calls[callDialogUserId] : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button id={CREATE_TRIGGER_ID} onClick={() => setIsCreating(true)}>
          <PlusIcon />
          Add contact
        </Button>
      </div>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No contacts yet. Add one to send them a message.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {users.map((user) => {
            const activeCall = calls[user.id];
            const isCallInProgress = activeCall?.status === "in_progress";

            return (
              <li key={user.id} className="flex items-center justify-between gap-4 p-4">
                <Link href={`/users/${user.id}`} className="min-w-0 hover:underline">
                  <p className="truncate font-medium">{user.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.phoneNumber}</p>
                </Link>

                {/* Action group — new per-row actions slot in here without touching the layout. */}
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    id={messageTriggerId(user.id)}
                    variant="outline"
                    size="sm"
                    onClick={() => setMessageTarget(user)}
                  >
                    <MessageSquareIcon />
                    Message
                  </Button>
                  <Button
                    id={callTriggerId(user.id)}
                    variant="outline"
                    size="sm"
                    disabled={startingCallFor === user.id || isCallInProgress}
                    onClick={() => void handleStartCall(user)}
                  >
                    <PhoneIcon />
                    {isCallInProgress ? "In call…" : "Call"}
                  </Button>
                  <Button
                    id={smsTriggerId(user.id)}
                    variant="outline"
                    size="sm"
                    onClick={() => setSmsTarget(user)}
                  >
                    <SendIcon />
                    SMS
                  </Button>
                  <Button
                    id={telegramTriggerId(user.id)}
                    variant="outline"
                    size="sm"
                    onClick={() => setTelegramTarget(user)}
                  >
                    <BotMessageSquareIcon />
                    Telegram
                  </Button>
                  <Button
                    id={editTriggerId(user.id)}
                    variant="outline"
                    size="sm"
                    onClick={() => setEditTarget(user)}
                  >
                    <PencilIcon />
                    Edit
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isCreating && (
        <CreateUserDialog
          triggerId={CREATE_TRIGGER_ID}
          onClose={() => setIsCreating(false)}
        />
      )}

      {messageTarget && (
        <SendMessageDialog
          key={messageTarget.id}
          user={messageTarget}
          triggerId={messageTriggerId(messageTarget.id)}
          onClose={() => setMessageTarget(null)}
        />
      )}

      {smsTarget && (
        <SendSmsDialog
          key={smsTarget.id}
          user={smsTarget}
          triggerId={smsTriggerId(smsTarget.id)}
          onClose={() => setSmsTarget(null)}
        />
      )}

      {telegramTarget && (
        <TelegramDialog
          key={telegramTarget.id}
          user={telegramTarget}
          triggerId={telegramTriggerId(telegramTarget.id)}
          onClose={() => setTelegramTarget(null)}
        />
      )}

      {editTarget && (
        <EditUserDialog
          key={editTarget.id}
          user={editTarget}
          triggerId={editTriggerId(editTarget.id)}
          onClose={() => setEditTarget(null)}
        />
      )}

      {callDialogTarget && callDialogCall && (
        <CallDialog
          key={callDialogTarget.id}
          user={callDialogTarget}
          call={callDialogCall}
          triggerId={callTriggerId(callDialogTarget.id)}
          onClose={() => setCallDialogUserId(null)}
        />
      )}
    </div>
  );
}
