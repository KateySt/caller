"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { FormField } from "@/components/form-field";
import { useUpdateUser } from "@/hooks/use-user-mutations";
import type { User } from "@/lib/api";
import { userSchema, type UserFormInput, type UserFormValues } from "@/lib/schemas/user";

interface EditUserDialogProps {
  user: User;
  /** Id of the row button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Mounted only while open and keyed by user id, so every open starts pre-filled with
 * that contact's *current* values — not whatever was typed during a previous open.
 */
export function EditUserDialog({ user, triggerId, onClose }: EditUserDialogProps) {
  const updateUser = useUpdateUser(user.id);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormInput, unknown, UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: user.name, phoneNumber: user.phoneNumber },
  });

  function handleOpenChange(open: boolean) {
    if (!open && !isSubmitting) {
      onClose();
    }
  }

  const submit = handleSubmit(async (values) => {
    try {
      const updated = await updateUser.mutateAsync(values);

      toast.success(`${updated.name} updated.`);
      onClose();
    } catch (error) {
      // Keeps the dialog open with the edited values intact so they can be corrected.
      toast.error(error instanceof Error ? error.message : "Could not update the contact.");
    }
  });

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isSubmitting}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit {user.name}</DialogTitle>
            <DialogDescription>Update this contact&apos;s name or phone number.</DialogDescription>
          </DialogHeader>

          <FormField label="Name" error={errors.name?.message}>
            {(controlProps) => (
              <Input
                {...controlProps}
                {...register("name")}
                disabled={isSubmitting}
                autoFocus
                placeholder="Ada Lovelace"
              />
            )}
          </FormField>

          <FormField label="Phone number" error={errors.phoneNumber?.message}>
            {(controlProps) => (
              <Input
                {...controlProps}
                {...register("phoneNumber")}
                type="tel"
                inputMode="tel"
                disabled={isSubmitting}
                placeholder="+380501234567"
              />
            )}
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
