import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import Link from "next/link";
import { AgentSettingsWorkspace } from "@/components/agent-settings-workspace";
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
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Agent Settings</h1>
          <p className="text-sm text-muted-foreground">
            This system prompt is used by the calling agent on every outbound call.
          </p>
        </div>
        <Link
          href="/agent-tests"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Test history
        </Link>
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
          <AgentSettingsWorkspace />
        </HydrationBoundary>
      )}
    </main>
  );
}
