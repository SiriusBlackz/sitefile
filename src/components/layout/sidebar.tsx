"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { buttonVariants } from "@/components/ui/button";
import {
  LayoutDashboard,
  FolderKanban,
  UserRound,
} from "lucide-react";
import { SitefileMark } from "./sitefile-mark";
import { OfflineQueueIndicator } from "./offline-queue-indicator";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/account", label: "Account", icon: UserRound },
];

export function Sidebar() {
  const pathname = usePathname();
  // Contractor's own mark in the header once branding is set up;
  // falls back to the Sitefile mark until then.
  const { data: org } = trpc.org.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-muted/30">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        {org?.logoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo */}
            <img
              src={org.logoUrl}
              alt={org.name}
              className="h-8 max-w-8 rounded object-contain"
            />
            <span className="truncate text-lg font-semibold" title={org.name}>
              {org.name}
            </span>
          </>
        ) : (
          <>
            <SitefileMark size={26} />
            <span className="text-lg font-semibold">Sitefile</span>
          </>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: isActive ? "secondary" : "ghost" }),
                "w-full justify-start gap-2"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 flex items-center justify-between gap-2">
        <OfflineQueueIndicator />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}
