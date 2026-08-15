"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  ListTodo,
  ImageIcon,
  Map,
  FileText,
  ClipboardList,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/evidence", label: "Evidence", icon: ImageIcon },
  { href: "/zones", label: "Zones", icon: Map },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/audit", label: "Audit Log", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Error codes meaning "this project isn't reachable" — don't retry, don't show tabs.
const UNREACHABLE_CODES = new Set(["NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"]);

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  // Shares the react-query cache entry with the overview page's project.get
  // call, so this adds no extra request on the happy path.
  const { error } = trpc.project.get.useQuery(
    { id: projectId },
    {
      retry: (failureCount, err) =>
        !UNREACHABLE_CODES.has(err.data?.code ?? "") && failureCount < 3,
    }
  );

  // Nonexistent/inaccessible project: tabs would all dead-end, so render none.
  if (error && UNREACHABLE_CODES.has(error.data?.code ?? "")) {
    return null;
  }

  return (
    <nav className="flex gap-1 overflow-x-auto border-b pb-px mb-6">
      {navItems.map((item) => {
        const href = `${base}${item.href}`;
        const isActive =
          item.href === ""
            ? pathname === base
            : pathname.startsWith(href);

        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 whitespace-nowrap transition-colors",
              isActive
                ? "border-primary text-(--accent-ink)"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
