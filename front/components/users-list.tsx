"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { api, type Call, type User } from "@/lib/api";

const CREATE_TRIGGER_ID = "create-user-trigger";
const messageTriggerId = (userId: string) => `message-trigger-${userId}`;
const smsTriggerId = (userId: string) => `sms-trigger-${userId}`;
const telegramTriggerId = (userId: string) => `telegram-trigger-${userId}`;
const editTriggerId = (userId: string) => `edit-trigger-${userId}`;
const callTriggerId = (userId: string) => `call-trigger-${userId}`;

/** How often an in-progress call's status/transcript is re-fetched (front SPEC-02 NFR). */
const CALL_POLL_INTERVAL_MS = 2500;

export function UsersList({ users }: { users: User[] }) {
  const router = useRouter();

  // The dialogs are lifted above the rows: picking another contact replaces the
  // open one instead of stacking a second dialog on top of it.
  const [isCreating, setIsCreating] = useState(false);
  const [messageTarget, setMessageTarget] = useState<User | null>(null);
  const [smsTarget, setSmsTarget] = useState<User | null>(null);
  const [telegramTarget, setTelegramTarget] = useState<User | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  // Calls are tracked by user id here (not inside the dialog) so a user's "in progress"
  // lock on the Call button survives the dialog being closed (front SPEC-02 AC-2, AC-3).
  const [calls, setCalls] = useState<Record<string, Call>>({});
  const [callDialogUserId, setCallDialogUserId] = useState<string | null>(null);
  const [startingCallFor, setStartingCallFor] = useState<string | null>(null);

  const callsRef = useRef(calls);
  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);

  useEffect(() => {
    const interval = setInterval(() => {
      for (const [userId, call] of Object.entries(callsRef.current)) {
        if (call.status !== "in_progress") {
          continue;
        }

        api
          .getCall(userId, call.id)
          .then((updated) => setCalls((prev) => ({ ...prev, [userId]: updated })))
          .catch(() => {
            // Transient poll failure — the next tick retries; the dialog keeps showing
            // the last known state rather than flashing an error for a single miss.
          });
      }
    }, CALL_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  async function handleStartCall(user: User) {
    setStartingCallFor(user.id);
    try {
      const call = await api.placeCall(user.id);
      setCalls((prev) => ({ ...prev, [user.id]: call }));
      setCallDialogUserId(user.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the call.");
    } finally {
      setStartingCallFor(null);
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
          // Re-runs the page's server component so the new contact shows up.
          onCreated={() => router.refresh()}
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
          onUpdated={() => router.refresh()}
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
