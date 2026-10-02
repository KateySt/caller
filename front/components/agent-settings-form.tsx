"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, MAX_SYSTEM_PROMPT_LENGTH, type AgentSettings } from "@/lib/api";

/**
 * The single global system prompt every call snapshots at start (front SPEC-02 AC-7..AC-12).
 * Not a dialog — this is the page's primary content, so there's nothing to "cancel" back to.
 */
export function AgentSettingsForm({ initialSettings }: { initialSettings: AgentSettings }) {
  const [systemPrompt, setSystemPrompt] = useState(initialSettings.systemPrompt);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fieldId = useId();
  const errorId = useId();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = systemPrompt.trim();
    if (trimmed.length === 0) {
      setValidationError("Enter a system prompt.");
      return;
    }
    if (trimmed.length > MAX_SYSTEM_PROMPT_LENGTH) {
      setValidationError(
        `System prompt is ${trimmed.length} characters — the limit is ${MAX_SYSTEM_PROMPT_LENGTH}.`,
      );
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    try {
      const updated = await api.updateAgentSettings(trimmed);

      setSystemPrompt(updated.systemPrompt);
      toast.success("Agent settings saved.");
    } catch (error) {
      // The field keeps whatever staff typed so the save can be retried without retyping.
      toast.error(error instanceof Error ? error.message : "Could not save agent settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium">
          System prompt
        </label>
        <Textarea
          id={fieldId}
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          onInput={() => setValidationError(null)}
          disabled={isSaving}
          rows={12}
          placeholder="You are a friendly outbound voice agent calling on behalf of…"
          aria-invalid={validationError !== null}
          aria-describedby={validationError ? errorId : undefined}
        />
        <div className="flex items-start justify-between gap-2 text-sm">
          <p id={errorId} role="alert" className="text-destructive">
            {validationError}
          </p>
          <span
            className={
              systemPrompt.trim().length > MAX_SYSTEM_PROMPT_LENGTH
                ? "shrink-0 tabular-nums text-destructive"
                : "shrink-0 tabular-nums text-muted-foreground"
            }
          >
            {systemPrompt.trim().length}/{MAX_SYSTEM_PROMPT_LENGTH}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
