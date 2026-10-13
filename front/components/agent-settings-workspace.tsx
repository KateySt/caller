"use client";

import { useCallback, useRef, useState } from "react";
import { AdminSecretGate } from "@/components/admin-secret-gate";
import { AgentSettingsForm, type AgentSettingsFormHandle } from "@/components/agent-settings-form";
import { AgentTestPanel } from "@/components/agent-test-panel";
import { useAdminSecret } from "@/lib/admin-secret";
import type { CreatedAgentTestSession } from "@/lib/api";

interface ActiveTest {
  created: CreatedAgentTestSession;
  ended: boolean;
}

/**
 * Agent Settings page body: the prompt form and, beside it, the inline browser test panel
 * (front SPEC-05 AC-7). Owns the current test session so the form can be locked while it runs.
 */
export function AgentSettingsWorkspace() {
  const adminSecret = useAdminSecret();
  const [test, setTest] = useState<ActiveTest | null>(null);
  const formRef = useRef<AgentSettingsFormHandle>(null);

  // AC-5: a 401 discards the secret; dropping the panel then leaves the room. Adjusted during
  // render (not in an effect) so a re-entered secret can never revive the old session's token.
  if (adminSecret === null && test !== null) {
    setTest(null);
  }

  const handleEnded = useCallback(() => {
    setTest((current) => (current && !current.ended ? { ...current, ended: true } : current));
  }, []);

  const testActive = test !== null && !test.ended;

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <AgentSettingsForm
        ref={formRef}
        testActive={testActive}
        onTestStarted={(created) => setTest({ created, ended: false })}
      />

      <section aria-labelledby="agent-test-heading" className="grid gap-3">
        <div>
          <h2 id="agent-test-heading" className="font-heading text-lg font-semibold">
            Test in browser
          </h2>
          <p className="text-sm text-muted-foreground">
            Talk to the agent through your microphone using the prompt in the form. Tests never
            save the prompt or call anyone.
          </p>
        </div>

        <AdminSecretGate>
          {test ? (
            <AgentTestPanel
              key={test.created.session.id}
              created={test.created}
              onEnded={handleEnded}
              onStartNew={() => void formRef.current?.startTest()}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Press &quot;Test in browser&quot; to start a voice session with the current prompt.
            </p>
          )}
        </AdminSecretGate>
      </section>
    </div>
  );
}
