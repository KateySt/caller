"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CharacterCounter, FormField } from "@/components/form-field";
import { useAgentSettings, useUpdateAgentSettings } from "@/hooks/use-agent-settings";
import { MAX_SYSTEM_PROMPT_LENGTH } from "@/lib/api";
import {
  agentSettingsSchema,
  type AgentSettingsFormInput,
  type AgentSettingsFormValues,
} from "@/lib/schemas/agent-settings";

/**
 * The single global system prompt every call snapshots at start (front SPEC-02 AC-7..AC-12).
 * Not a dialog — this is the page's primary content, so there's nothing to "cancel" back to.
 */
export function AgentSettingsForm() {
  const { data: settings } = useAgentSettings();
  const updateSettings = useUpdateAgentSettings();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AgentSettingsFormInput, unknown, AgentSettingsFormValues>({
    resolver: zodResolver(agentSettingsSchema),
    defaultValues: { systemPrompt: settings.systemPrompt },
  });
  const length = (useWatch({ control, name: "systemPrompt" }) ?? "").trim().length;

  const submit = handleSubmit(async ({ systemPrompt }) => {
    try {
      const updated = await updateSettings.mutateAsync(systemPrompt);

      // Show the trimmed value the server stored.
      reset({ systemPrompt: updated.systemPrompt });
      toast.success("Agent settings saved.");
    } catch (error) {
      // The field keeps whatever staff typed so the save can be retried without retyping.
      toast.error(error instanceof Error ? error.message : "Could not save agent settings.");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FormField
        label="System prompt"
        error={errors.systemPrompt?.message}
        counter={<CharacterCounter length={length} max={MAX_SYSTEM_PROMPT_LENGTH} />}
      >
        {(controlProps) => (
          <Textarea
            {...controlProps}
            {...register("systemPrompt")}
            disabled={isSubmitting}
            rows={12}
            placeholder="You are a friendly outbound voice agent calling on behalf of…"
          />
        )}
      </FormField>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
