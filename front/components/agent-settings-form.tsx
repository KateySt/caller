"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CharacterCounter, FormField } from "@/components/form-field";
import { useAgentSettings, useUpdateAgentSettings } from "@/hooks/use-agent-settings";
import { useCreateAgentTestSession } from "@/hooks/use-agent-tests";
import { useIsSecureContext } from "@/hooks/use-is-secure-context";
import { useAdminSecret } from "@/lib/admin-secret";
import { describeCreateTestError, INSECURE_CONTEXT_MESSAGE } from "@/lib/agent-test-format";
import { MAX_SYSTEM_PROMPT_LENGTH, type CreatedAgentTestSession } from "@/lib/api";
import {
  agentSettingsSchema,
  type AgentSettingsFormInput,
  type AgentSettingsFormValues,
} from "@/lib/schemas/agent-settings";

/** Lets the test panel's "Start new test" run the same validated start as the form's button. */
export interface AgentSettingsFormHandle {
  startTest: () => Promise<void>;
}

interface AgentSettingsFormProps {
  ref?: Ref<AgentSettingsFormHandle>;
  /** A browser test session is connecting or live: the prompt and Save are locked (front SPEC-05 AC-10). */
  testActive: boolean;
  onTestStarted: (created: CreatedAgentTestSession) => void;
}

/**
 * The single global system prompt every call snapshots at start (front SPEC-02 AC-7..AC-12),
 * plus "Test in browser" with the prompt as typed — saved or not (front SPEC-05 AC-7..AC-12).
 * Not a dialog — this is the page's primary content, so there's nothing to "cancel" back to.
 */
export function AgentSettingsForm({ ref, testActive, onTestStarted }: AgentSettingsFormProps) {
  const { data: settings } = useAgentSettings();
  const updateSettings = useUpdateAgentSettings();
  const createTest = useCreateAgentTestSession();
  const adminSecret = useAdminSecret();
  const isSecure = useIsSecureContext();
  const {
    register,
    handleSubmit,
    reset,
    trigger,
    getValues,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AgentSettingsFormInput, unknown, AgentSettingsFormValues>({
    resolver: zodResolver(agentSettingsSchema),
    defaultValues: { systemPrompt: settings.systemPrompt },
  });
  const length = (useWatch({ control, name: "systemPrompt" }) ?? "").trim().length;

  // Connecting (create in flight) or live: the prompt in use must not change under the session.
  const locked = testActive || createTest.isPending;
  const canStartTest = !locked && !isSubmitting && adminSecret !== null && isSecure;
  const startingRef = useRef(false);

  const submit = handleSubmit(async ({ systemPrompt }) => {
    if (locked) return;
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

  /** Validates like Save, then starts a session with the draft — never submits or saves the form (AC-8/9). */
  const startTest = async () => {
    // The ref catches a second click (or "Start new test") before `isPending` re-renders.
    if (!canStartTest || startingRef.current) return;
    startingRef.current = true;
    try {
      if (!(await trigger("systemPrompt", { shouldFocus: true }))) return;
      onTestStarted(await createTest.mutateAsync(getValues("systemPrompt").trim()));
    } catch {
      // Shown below from `createTest.error` (AC-12); no live panel is opened.
    } finally {
      startingRef.current = false;
    }
  };

  useImperativeHandle(ref, () => ({ startTest }));

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FormField
        label="System prompt"
        error={errors.systemPrompt?.message}
        hint={locked ? "Locked while a browser test is running. End the test to edit." : undefined}
        counter={<CharacterCounter length={length} max={MAX_SYSTEM_PROMPT_LENGTH} />}
      >
        {(controlProps) => (
          <Textarea
            {...controlProps}
            {...register("systemPrompt")}
            disabled={isSubmitting || locked}
            rows={12}
            placeholder="You are a friendly outbound voice agent calling on behalf of…"
          />
        )}
      </FormField>

      {isDirty && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Using unsaved draft prompt — &quot;Test in browser&quot; uses the text above without saving it.
        </p>
      )}

      {!isSecure && (
        <p role="alert" className="text-sm text-destructive">
          {INSECURE_CONTEXT_MESSAGE}
        </p>
      )}

      {createTest.error && (
        <p role="alert" className="text-sm text-destructive">
          {describeCreateTestError(createTest.error)}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {adminSecret === null && (
          <span className="mr-auto text-sm text-muted-foreground">
            Enter the admin key in the test panel to test in the browser.
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!canStartTest}
          onClick={() => void startTest()}
        >
          {createTest.isPending ? "Starting…" : testActive ? "Test running…" : "Test in browser"}
        </Button>
        <Button type="submit" disabled={isSubmitting || locked}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
