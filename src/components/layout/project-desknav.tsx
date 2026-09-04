"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { buildRecipeRows, type GapSnapshot } from "@/lib/readiness";
import {
  ClipboardList,
  FileText,
  ImageIcon,
  LayoutDashboard,
  ListTodo,
  Map,
  NotebookPen,
  Send,
  Settings,
} from "lucide-react";

/**
 * The desk navigation — The Graft's grouped left rail. Rooms are grouped
 * by rhythm, not by feature: what you touch every day, what you set up
 * once per period, and the send moment. Live dots mark rooms with open
 * work. Phone users never see this — their home is the navigator.
 */

const UNREACHABLE_CODES = new Set(["NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"]);

function DesknavInner({ projectId }: { projectId: string }) {
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

  if (error && UNREACHABLE_CODES.has(error.data?.code ?? "")) return null;

  const rows = gaps ? buildRecipeRows(gaps as GapSnapshot) : [];
  const open = (keys: string[]) =>
    rows.some((r) => keys.includes(r.key) && r.state !== "done");

  const groups: {
    label: string;
    items: {
      href: string;
      label: string;
      icon: typeof ListTodo;
      attention?: boolean;
      isActive: (path: string) => boolean;
    }[];
  }[] = [
    {
      label: "Every day",
      items: [
        {
          href: `${base}/evidence`,
          label: "Photos",
          icon: ImageIcon,
          attention: (gaps?.unlinked ?? 0) > 0,
          isActive: (p) => p === `${base}/evidence`,
        },
        {
          href: `${base}/diary`,
          label: "Site Diary",
          icon: NotebookPen,
          attention: (gaps?.diaryMissedDays ?? 0) > 0,
          isActive: (p) => p.startsWith(`${base}/diary`),
        },
        {
          href: `${base}/reports`,
          label: "Report draft",
          icon: FileText,
          attention: open(["narrative", "issues", "signoff"]),
          isActive: (p) => p.startsWith(`${base}/reports`) && !p.endsWith("/send"),
        },
      ],
    },
    {
      label: "Setup · per period",
      items: [
        {
          href: `${base}/tasks`,
          label: "Programme",
          icon: ListTodo,
          attention:
            (gaps?.taskCount ?? 0) === 0 ||
            (gaps ? !gaps.programmeConfirmedThisPeriod : false),
          isActive: (p) => p.startsWith(`${base}/tasks`),
        },
        {
          href: `${base}/zones`,
          label: "Zones",
          icon: Map,
          attention: (gaps?.zoneCount ?? 1) === 0,
          isActive: (p) => p.startsWith(`${base}/zones`),
        },
      ],
    },
    {
      label: "Send",
      items: [
        {
          href: gaps?.lastReport
            ? `${base}/reports/${gaps.lastReport.id}/send`
            : `${base}/reports`,
          label: "Review & send",
          icon: Send,
          isActive: (p) => p.endsWith("/send"),
        },
      ],
    },
  ];

  return (
    <nav className="hidden w-48 shrink-0 md:block">
      <div className="sticky top-4 space-y-5">
        <Link
          href={base}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
            pathname === base
              ? "bg-accent text-(--accent-ink)"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Overview
        </Link>
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.isActive(pathname);
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                        active
                          ? "bg-accent font-medium text-(--accent-ink)"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.attention && (
                        <span
                          aria-label="Needs attention"
                          className="h-2 w-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="border-t pt-3">
          <ul className="space-y-0.5">
            <li>
              <Link
                href={`${base}/audit`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  pathname.startsWith(`${base}/audit`)
                    ? "bg-accent font-medium text-(--accent-ink)"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ClipboardList className="h-4 w-4" />
                Audit log
              </Link>
            </li>
            <li>
              <Link
                href={`${base}/settings`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  pathname.startsWith(`${base}/settings`)
                    ? "bg-accent font-medium text-(--accent-ink)"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}

export function ProjectDeskNav({ projectId }: { projectId: string }) {
  return <DesknavInner projectId={projectId} />;
}
