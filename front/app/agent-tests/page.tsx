import type { Metadata } from "next";
import { AgentTestHistory } from "@/components/agent-test-history";

export const metadata: Metadata = {
  title: "Agent tests",
};

export default function AgentTestsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Agent Tests</h1>
        <p className="text-sm text-muted-foreground">Browser test sessions of the calling agent, newest first.</p>
      </header>
      <AgentTestHistory />
    </main>
  );
}
