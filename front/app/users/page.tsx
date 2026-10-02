import type { Metadata } from "next";
import { UsersList } from "@/components/users-list";
import { api, type User } from "@/lib/api";

export const metadata: Metadata = {
  title: "Users",
};

// The list reflects whatever the API holds right now, so never prerender it.
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  let users: User[] | null = null;

  try {
    users = await api.listUsers();
  } catch {
    users = null;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Message, call, or text a contact — click a name to see their full activity history.
        </p>
      </header>

      {users === null ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive"
        >
          Could not load the user list. Check that the API is running, then reload the page.
        </p>
      ) : (
        <UsersList users={users} />
      )}
    </main>
  );
}
