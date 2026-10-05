"use client";

import { useId, useRef, useState } from "react";
import { CopyIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  type TelegramInvite,
  type TelegramStatus,
  type TelegramStatusInfo,
} from "@/lib/api";

const STATUS_LABEL: Record<TelegramStatus, string> = {
  not_linked: "Not linked",
  linked: "Linked",
  opted_out: "Opted out",
  unreachable: "Unreachable",
};

function formatTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString();
}

interface TelegramInvitePanelProps {
  userId: string;
  statusInfo: TelegramStatusInfo;
  onStatusChange: (status: TelegramStatusInfo) => void;
}

/**
 * Status label plus invitation link generation (front SPEC-03 AC-3..7). The raw link lives
 * only in this component's state: it is shown once and discarded when the dialog closes.
 */
export function TelegramInvitePanel({
  userId,
  statusInfo,
  onStatusChange,
}: TelegramInvitePanelProps) {
  const [invite, setInvite] = useState<TelegramInvite | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const linkFieldId = useId();
  const linkRef = useRef<HTMLInputElement>(null);

  // AC-5: warn before replacing an unused link, or when the contact is already linked.
  const needsConfirmation =
    invite !== null || statusInfo.hasPendingInvite || statusInfo.status !== "not_linked";

  async function generate() {
    setIsConfirming(false);
    setIsGenerating(true);
    try {
      const created = await api.createTelegramInvite(userId);
      setInvite(created);
      onStatusChange(created.status);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the link.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copy() {
    if (!invite) {
      return;
    }
    try {
      await navigator.clipboard.writeText(invite.link);
      toast.success("Link copied.");
    } catch {
      // Clipboard unavailable (insecure context / permission): leave the link selectable.
      linkRef.current?.select();
      toast.error("Could not copy automatically. The link is selected: press Ctrl+C to copy it.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="text-muted-foreground">Status: </span>
          <strong>{STATUS_LABEL[statusInfo.status]}</strong>
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={isGenerating}
          onClick={() => (needsConfirmation ? setIsConfirming(true) : void generate())}
        >
          <LinkIcon />
          {isGenerating ? "Generating…" : "Generate link"}
        </Button>
      </div>

      {isConfirming && (
        <div role="group" aria-label="Confirm new link" className="grid gap-2 rounded-lg border p-3">
          <p>
            Generating a new link means any previously issued link that has not been used will
            stop working. Continue?
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void generate()}>
              Generate new link
            </Button>
            <Button size="sm" variant="outline" autoFocus onClick={() => setIsConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {invite && (
        <div className="grid gap-2 rounded-lg border p-3">
          <label htmlFor={linkFieldId} className="text-sm font-medium">
            Invitation link (expires {formatTimestamp(invite.expiresAt)})
          </label>
          <div className="flex gap-2">
            <Input
              id={linkFieldId}
              ref={linkRef}
              readOnly
              value={invite.link}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" onClick={() => void copy()}>
              <CopyIcon />
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shown only now. Closing this window discards it; generate a new one if lost.
          </p>
        </div>
      )}
    </>
  );
}
