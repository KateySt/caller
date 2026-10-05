import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserActivityTimeline } from "@/components/user-activity-timeline";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Contact activity",
};

// Calls can be in progress, so this view must never be a stale prerendered snapshot.
export const dynamic = "force-dynamic";

interface UserActivityPageProps {
  params: Promise<{ id: string }>;
}

export default async function UserActivityPage({ params }: UserActivityPageProps) {
  const { id } = await params;

  // There's no single-user GET endpoint; the list is small and unpaginated, so finding
  // the contact in it is simpler than adding a new backend route for this page alone.
  const users = await api.listUsers().catch(() => null);

  if (users === null) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive"
        >
          Could not load this contact. Check that the API is running, then reload the page.
        </p>
      </main>
    );
  }

  const user = users.find((candidate) => candidate.id === id);
  if (!user) {
    notFound();
  }

  const [callsResult, whatsappResult, smsResult, telegramResult] = await Promise.allSettled([
    api.listCalls(id),
    api.listWhatsAppMessages(id),
    api.listSmsMessages(id),
    api.listTelegramMessages(id, { limit: 50 }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link href="/users" className="text-sm text-muted-foreground hover:underline">
        ← Back to users
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="font-heading text-2xl font-semibold">{user.name}</h1>
        <p className="text-sm text-muted-foreground">{user.phoneNumber}</p>
      </header>

      <UserActivityTimeline
        calls={callsResult.status === "fulfilled" ? callsResult.value : null}
        whatsappMessages={whatsappResult.status === "fulfilled" ? whatsappResult.value : null}
        smsMessages={smsResult.status === "fulfilled" ? smsResult.value : null}
        telegramPage={telegramResult.status === "fulfilled" ? telegramResult.value : null}
      />
    </main>
  );
}
