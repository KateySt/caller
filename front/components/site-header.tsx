"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Agent Settings" },
  { href: "/users", label: "Users" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <nav className="mx-auto flex w-full max-w-2xl items-center gap-4 px-6 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                isActive && "text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
