"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  Check,
  ChevronDown,
  LayoutDashboard,
  ListTodo,
  ImageIcon,
  Map,
  FileText,
  ClipboardList,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The thread: project navigation as the journey itself — Set up →
 * Capture → Review → Send — with live done-states from project data.
 * The five old sections survive in the Jump menu as reference screens;
 * they just stop being the navigation. (Design competition, One Thread
 * philosophy; grafted per the composite.)
 */

const JUMP_ITEMS = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/tasks", label: "Programme & tasks", icon: ListTodo },
  { href: "/evidence", label: "Photo library", icon: ImageIcon },
  { href: "/zones", label: "Zone map", icon: Map },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/audit", label: "Audit log", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Error codes meaning "this project isn't reachable" — don't retry, don't show tabs.
const UNREACHABLE_CODES = new Set(["NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"]);

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const { error } = trpc.project.get.useQuery(
    { id: projectId },
    {
      retry: (failureCount, err) =>
        !UNREACHABLE_CODES.has(err.data?.code ?? "") && failureCount < 3,
    }
  );
  const { data: gaps } = trpc.project.gapList.useQuery(
    { id: projectId },
    { retry: false }
  );

  if (error && UNREACHABLE_CODES.has(error.data?.code ?? "")) {
    return null;
  }

  const setupDone = (gaps?.taskCount ?? 0) > 0;
  const captureDone = (gaps?.photosThisPeriod ?? 0) > 0;
  const reviewDone = captureDone && (gaps?.unlinked ?? 0) === 0;
  const sendDone = gaps?.lastReportNumber != null;

  const beats = [
    { key: "setup", label: "Set up", href: `${base}/tasks`, done: setupDone },
    { key: "capture", label: "Capture", href: `${base}/evidence`, done: captureDone },
    { key: "review", label: "Review", href: `${base}/reports`, done: reviewDone },
    { key: "send", label: "Send", href: `${base}/reports`, done: sendDone },
  ];

  // Which beat the current page belongs to (Review wins /reports; Send is
  // a state, not a separate room).
  const activeKey = pathname.startsWith(`${base}/tasks`)
    ? "setup"
    : pathname.startsWith(`${base}/zones`) || pathname.startsWith(`${base}/settings`)
      ? "setup"
      : pathname.startsWith(`${base}/evidence`)
        ? "capture"
        : pathname.startsWith(`${base}/reports`)
          ? "review"
          : null;

  return (
    <nav className="mb-6 flex items-center justify-between gap-2 border-b pb-3">
      <ol className="flex min-w-0 items-center gap-0 overflow-x-auto">
        {beats.map((beat, i) => {
          const isActive = activeKey === beat.key;
          return (
            <li key={beat.key} className="flex shrink-0 items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1 h-px w-4 sm:w-7",
                    beats[i - 1].done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <Link
                href={beat.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium transition-colors sm:px-2.5",
                  isActive
                    ? "text-(--accent-ink)"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    beat.done
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "border-2 border-primary text-(--accent-ink)"
                        : "border border-border text-muted-foreground"
                  )}
                >
                  {beat.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="whitespace-nowrap">{beat.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">
          Jump
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {JUMP_ITEMS.map((item) => {
            const href = `${base}${item.href}`;
            const isHere =
              item.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <DropdownMenuItem key={item.href} render={<Link href={href} />}>
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
                {isHere && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
