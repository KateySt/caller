import type { Metadata } from "next";
import { AgentSettingsForm } from "@/components/agent-settings-form";
import { api, type AgentSettings } from "@/lib/api";

export const metadata: Metadata = {
  title: "Agent Settings",
};

// The saved prompt can change between visits, so never prerender it.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let settings: AgentSettings | null = null;

  try {
    settings = await api.getAgentSettings();
  } catch {
    settings = null;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Agent Settings</h1>
        <p className="text-sm text-muted-foreground">
          This system prompt is used by the calling agent on every outbound call.
        </p>
      </header>

      {settings === null ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive"
        >
          Could not load the agent settings. Check that the API is running, then reload the page.
        </p>
      ) : (
        <AgentSettingsForm initialSettings={settings} />
      )}
    </main>
  );
}
