import type { Metadata } from "next";
import Link from "next/link";
import { AgentTestDetail } from "@/components/agent-test-detail";

export const metadata: Metadata = {
  title: "Agent test",
};

export default async function AgentTestPage({ params }: PageProps<"/agent-tests/[id]">) {
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6 grid gap-1">
        <Link
          href="/agent-tests"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Test history
        </Link>
        <h1 className="font-heading text-2xl font-semibold">Agent test</h1>
      </header>
      <AgentTestDetail id={id} />
    </main>
  );
}
