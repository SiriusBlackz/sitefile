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

  // Inside a project the desknav is the primary navigation — the org
  // sidebar collapses to a slim icon rail so the screen isn't framed by
  // two full-width rails.
  const inProject = /^\/projects\/[0-9a-f-]{20,}/i.test(pathname);
  if (inProject) {
    return (
      <aside className="hidden md:flex w-14 flex-col items-center border-r border-(--sidebar-border) bg-sidebar text-sidebar-foreground">
        <Link
          href="/projects"
          title={org?.name ?? "Sitefile"}
          className="flex h-14 w-full items-center justify-center border-b border-(--sidebar-border)"
        >
          {org?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo
            <img
              src={org.logoUrl}
              alt={org.name}
              className="h-8 w-8 rounded object-contain"
            />
          ) : (
            <SitefileMark size={26} />
          )}
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1 py-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  isActive && "bg-sidebar-accent text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-1 border-t border-(--sidebar-border) py-2">
          <OfflineQueueIndicator />
          <ThemeToggle />
          <UserMenu />
        </div>
      </aside>
    );
  }

  return (
    // Ink chrome: the sidebar consumes the sidebar token set so the app
    // frame carries the brand while content stays on site-dust paper.
    <aside className="hidden md:flex w-64 flex-col border-r border-(--sidebar-border) bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-(--sidebar-border) px-4">
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
                buttonVariants({ variant: "ghost" }),
                "w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                isActive &&
                  "bg-sidebar-accent text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3 px-4 pb-2 text-[11px] text-sidebar-foreground/60">
        <Link href="/support" className="hover:text-sidebar-foreground">Support</Link>
        <Link href="/privacy" className="hover:text-sidebar-foreground">Privacy</Link>
        <Link href="/terms" className="hover:text-sidebar-foreground">Terms</Link>
      </div>
      <div className="border-t border-(--sidebar-border) p-3 flex items-center justify-between gap-2">
        <OfflineQueueIndicator />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}
