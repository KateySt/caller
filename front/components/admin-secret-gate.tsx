"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { clearAdminSecret, setAdminSecret, useAdminSecret } from "@/lib/admin-secret";
import {
  adminSecretSchema,
  type AdminSecretFormInput,
  type AdminSecretFormValues,
} from "@/lib/schemas/admin-secret";

/**
 * Renders `children` only while the admin secret is held (front SPEC-05 AC-1); otherwise asks
 * for it. A secret that disappears without "Forget" was discarded after a 401 (AC-5), so the
 * prompt then says it was missing or wrong.
 */
export function AdminSecretGate({ children }: { children: React.ReactNode }) {
  const secret = useAdminSecret();
  const [prevSecret, setPrevSecret] = useState(secret);
  const [rejected, setRejected] = useState(false);

  // Adjust state while rendering (no effect): notice the secret being dropped from under us.
  if (secret !== prevSecret) {
    setPrevSecret(secret);
    setRejected(prevSecret !== null && secret === null);
  }

  const forget = () => {
    // Recorded together with the store change so this isn't mistaken for a rejected secret (AC-4).
    setPrevSecret(null);
    setRejected(false);
    clearAdminSecret();
  };

  if (!secret) {
    return <AdminSecretForm rejected={rejected} />;
  }

  return (
    <div className="grid gap-4">
      {children}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={forget}>
          Forget admin key
        </Button>
      </div>
    </div>
  );
}

function AdminSecretForm({ rejected }: { rejected: boolean }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminSecretFormInput, unknown, AdminSecretFormValues>({
    resolver: zodResolver(adminSecretSchema),
    defaultValues: { secret: "" },
  });

  // Kept in this tab's sessionStorage only (AC-2) — never in a URL, env var or log.
  const submit = handleSubmit(({ secret }) => setAdminSecret(secret));

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl border p-4">
      {rejected ? (
        <p role="alert" className="text-sm text-destructive">
          The admin key was missing or wrong — re-enter it.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Browser tests are for admins. Enter the admin key to continue — it is kept only in this
          browser tab and forgotten when the tab closes.
        </p>
      )}

      <FormField label="Admin key" error={errors.secret?.message}>
        {(controlProps) => (
          <Input
            {...controlProps}
            {...register("secret")}
            type="password"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </FormField>

      <div className="flex justify-end">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}
