"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ITEM_STATUS_LABELS, locationLine } from "@/lib/inspection-location";
import { ArrowLeft, ChevronRight, ClipboardPlus, Search } from "lucide-react";
import { PendingDraftsBanner } from "@/components/inspection/pending-drafts-banner";

export default function InspectListPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-background" />}>
      <InspectList />
    </Suspense>
  );
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "ready_for_review", label: "Ready" },
  { key: "verified_closed", label: "Closed" },
] as const;

function InspectList() {
  const params = useSearchParams();
  const projectId = params.get("projectId") ?? "";
  const [filter, setFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const { data: project } = trpc.project.get.useQuery({ id: projectId }, { enabled: !!projectId });
  const { data: items = [], isLoading } = trpc.inspection.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const shown = items
    .filter((it) => (filter === "open" ? ["open", "in_progress", "reopened"].includes(it.status) : filter ? it.status === filter : true))
    .filter((it) => {
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      const loc = it.location as { description: string };
      return (
        it.ref.toLowerCase().includes(needle) ||
        it.title.toLowerCase().includes(needle) ||
        loc.description.toLowerCase().includes(needle)
      );
    });

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-2 border-b px-3 py-3">
        <Link href={`/projects/${projectId}`} aria-label="Back" className="rounded-full p-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">Register</h1>
          <p className="truncate text-xs text-muted-foreground">{project?.name}</p>
        </div>
        <Link
          href={`/inspect/new?projectId=${projectId}`}
          className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          <ClipboardPlus className="h-4 w-4" /> Record
        </Link>
      </header>

      <div className="space-y-2 px-3 py-2">
        <PendingDraftsBanner projectId={projectId} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ref, title or location"
            className="h-10 w-full rounded-lg border bg-background pl-8 pr-3 text-sm"
            aria-label="Filter register"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === f.key ? "bg-foreground text-background" : ""
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto px-3 pb-6">
        {isLoading && <li className="h-16 animate-pulse rounded-xl bg-muted" />}
        {!isLoading && shown.length === 0 && (
          <li className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            No items{filter || q ? " match" : " recorded yet"}.
          </li>
        )}
        {shown.map((it) => (
          <li key={it.id}>
            <Link
              href={`/inspect/${it.id}?projectId=${projectId}`}
              className="flex items-center gap-3 rounded-xl border p-3"
            >
              {it.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px] text-muted-foreground">
                  no photo
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold">{it.ref}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                      it.status === "verified_closed"
                        ? "bg-green-500/15 text-green-700"
                        : "bg-accent text-(--accent-ink)"
                    )}
                  >
                    {ITEM_STATUS_LABELS[it.status]}
                  </span>
                </span>
                <span className="block truncate text-sm font-medium">{it.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {locationLine(project?.locationScheme, it.location as never)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
