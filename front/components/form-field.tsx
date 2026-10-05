"use client";

import { useId } from "react";

interface FormFieldControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

interface FormFieldProps {
  label: string;
  /** Validation message from the form library (`formState.errors.<name>?.message`). */
  error?: string;
  /** Always-visible helper text, e.g. why the field is disabled. Hidden while an error shows. */
  hint?: string;
  /** Right-aligned next to the error, e.g. a `n/4096` character counter. */
  counter?: React.ReactNode;
  /** Receives the id / aria wiring to spread onto the control next to `register(...)`. */
  children: (controlProps: FormFieldControlProps) => React.ReactNode;
}

/**
 * Label + control + error wiring in one place, so every form gets the same accessible
 * markup (`aria-invalid`, `aria-describedby`, `role="alert"` error) without repeating it.
 */
export function FormField({ label, error, hint, counter, children }: FormFieldProps) {
  const baseId = useId();
  const controlId = `${baseId}-control`;
  const errorId = `${baseId}-error`;
  const hintId = `${baseId}-hint`;

  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="grid gap-2">
      <label htmlFor={controlId} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id: controlId,
        "aria-invalid": error !== undefined,
        "aria-describedby": describedBy,
      })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="flex items-start justify-between gap-2 text-sm">
        <p id={errorId} role="alert" className="text-destructive">
          {error}
        </p>
        {counter}
      </div>
    </div>
  );
}

/** `n/max` counter that turns red once over the limit. */
export function CharacterCounter({ length, max }: { length: number; max: number }) {
  return (
    <span
      className={
        length > max
          ? "shrink-0 tabular-nums text-destructive"
          : "shrink-0 tabular-nums text-muted-foreground"
      }
    >
      {length}/{max}
    </span>
  );
}
