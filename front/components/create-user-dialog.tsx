"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, E164_PATTERN, MAX_NAME_LENGTH } from "@/lib/api";

interface CreateUserDialogProps {
  /** Id of the button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
  /** Called after the backend confirms the new contact, to refresh the list. */
  onCreated: () => void;
}

interface FieldErrors {
  name?: string;
  phoneNumber?: string;
}

/**
 * Mounted only while open, so every open starts from an empty form.
 * Validation here mirrors the backend's rules; the backend stays the authority
 * (it owns the uniqueness check, which the client cannot know up front).
 */
export function CreateUserDialog({ triggerId, onClose, onCreated }: CreateUserDialogProps) {
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const nameId = useId();
  const nameErrorId = useId();
  const phoneId = useId();
  const phoneErrorId = useId();

  function handleOpenChange(open: boolean) {
    // Not dismissible while the request is in flight.
    if (!open && !isSaving) {
      onClose();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedPhone = phoneNumber.trim();
    const nextErrors: FieldErrors = {};

    if (trimmedName.length === 0) {
      nextErrors.name = "Enter a name.";
    } else if (trimmedName.length > MAX_NAME_LENGTH) {
      nextErrors.name = `Name is longer than ${MAX_NAME_LENGTH} characters.`;
    }
    if (!E164_PATTERN.test(trimmedPhone)) {
      nextErrors.phoneNumber = "Use E.164 format, e.g. +380501234567.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSaving(true);
    try {
      const user = await api.createUser({ name: trimmedName, phoneNumber: trimmedPhone });

      toast.success(`${user.name} added.`);
      onCreated();
      onClose();
    } catch (error) {
      // Keeps the dialog open with both fields intact so the input can be corrected.
      toast.error(error instanceof Error ? error.message : "Could not create the contact.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isSaving}>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>
              The phone number is how WhatsApp reaches them, and it has to be unique.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label htmlFor={nameId} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSaving}
              autoFocus
              placeholder="Ada Lovelace"
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name ? nameErrorId : undefined}
            />
            {errors.name && (
              <p id={nameErrorId} role="alert" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <label htmlFor={phoneId} className="text-sm font-medium">
              Phone number
            </label>
            <Input
              id={phoneId}
              type="tel"
              inputMode="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              disabled={isSaving}
              placeholder="+380501234567"
              aria-invalid={errors.phoneNumber !== undefined}
              aria-describedby={errors.phoneNumber ? phoneErrorId : undefined}
            />
            {errors.phoneNumber && (
              <p id={phoneErrorId} role="alert" className="text-sm text-destructive">
                {errors.phoneNumber}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Adding…" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
