"use client";

import { Controller, useForm } from "react-hook-form";
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
import { PhoneInput } from "@/components/ui/phone-input";
import { FormField } from "@/components/form-field";
import { useCreateUser } from "@/hooks/use-user-mutations";
import { userSchema, type UserFormInput, type UserFormValues } from "@/lib/schemas/user";

interface CreateUserDialogProps {
  /** Id of the button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Mounted only while open, so every open starts from an empty form.
 * Validation mirrors the backend's rules; the backend stays the authority
 * (it owns the uniqueness check, which the client cannot know up front).
 */
export function CreateUserDialog({ triggerId, onClose }: CreateUserDialogProps) {
  const createUser = useCreateUser();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormInput, unknown, UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", phoneNumber: "" },
  });

  function handleOpenChange(open: boolean) {
    // Not dismissible while the request is in flight.
    if (!open && !isSubmitting) {
      onClose();
    }
  }

  const submit = handleSubmit(async (values) => {
    try {
      // Resolves once the users list has been refetched, so the new contact is already shown.
      const user = await createUser.mutateAsync(values);

      toast.success(`${user.name} added.`);
      onClose();
    } catch (error) {
      // Keeps the dialog open with both fields intact so the input can be corrected.
      toast.error(error instanceof Error ? error.message : "Could not create the contact.");
    }
  });

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isSubmitting}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>
              The phone number is how WhatsApp reaches them, and it has to be unique.
            </DialogDescription>
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
              <Controller
                control={control}
                name="phoneNumber"
                render={({ field }) => (
                  <PhoneInput
                    {...controlProps}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    defaultCountry="UA"
                    disabled={isSubmitting}
                    placeholder="050 123 45 67"
                  />
                )}
              />
            )}
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
