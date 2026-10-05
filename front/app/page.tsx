import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { AgentSettingsForm } from "@/components/agent-settings-form";
import { api } from "@/lib/api";
import { agentSettingsQueries } from "@/lib/queries/agent-settings";
import { makeQueryClient } from "@/lib/query-client";

export const metadata: Metadata = {
  title: "Agent Settings",
};

// The saved prompt can change between visits, so never prerender it.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Loaded here (not in the client) so a failure renders the page-level error below; the
  // client form then reads the same data from the hydrated cache.
  const queryClient = makeQueryClient();
  let isLoaded = false;

  try {
    queryClient.setQueryData(agentSettingsQueries.detail().queryKey, await api.getAgentSettings());
    isLoaded = true;
  } catch {
    isLoaded = false;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Agent Settings</h1>
        <p className="text-sm text-muted-foreground">
          This system prompt is used by the calling agent on every outbound call.
        </p>
      </header>

      {!isLoaded ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive"
        >
          Could not load the agent settings. Check that the API is running, then reload the page.
        </p>
      ) : (
        <HydrationBoundary state={dehydrate(queryClient)}>
          <AgentSettingsForm />
        </HydrationBoundary>
      )}
    </main>
  );
}
