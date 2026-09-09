"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { formatDate } from "@/lib/format";
import {
  NotebookPen,
  AlertTriangle,
  Image as ImageIcon,
  FileText,
  ListTodo,
  ClipboardList,
  Search as SearchIcon,
} from "lucide-react";
import { SEARCH_MARK_START, SEARCH_MARK_END } from "@/server/services/search";

const KIND: Record<
  string,
  { label: string; icon: typeof NotebookPen }
> = {
  diary_work: { label: "Diary · work", icon: NotebookPen },
  diary_note: { label: "Diary · notes", icon: NotebookPen },
  holdup: { label: "Hold-up", icon: AlertTriangle },
  photo: { label: "Photo", icon: ImageIcon },
  report: { label: "Report", icon: FileText },
  task: { label: "Activity", icon: ListTodo },
  inspection_item: { label: "Register item", icon: ClipboardList },
};

/** Render a ts_headline snippet, bolding the marked terms — no HTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(
    new RegExp(`(${SEARCH_MARK_START}[^${SEARCH_MARK_END}]*${SEARCH_MARK_END})`, "g")
  );
  return (
    <p className="text-sm text-muted-foreground">
      {parts.map((part, i) =>
        part.startsWith(SEARCH_MARK_START) ? (
          <mark
            key={i}
            className="rounded bg-[color-mix(in_oklab,var(--accent)_25%,transparent)] px-0.5 font-medium text-foreground"
          >
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export default function ProjectSearchPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) {
      setText(initial);
      setQ(initial);
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer.current);
  }, [text]);

  const search = trpc.search.project.useQuery(
    { projectId, q },
    { enabled: q.length >= 2, placeholderData: (prev) => prev }
  );

  const hits = (search.data?.hits ?? []).filter((h) => !filter || h.kind === filter);
  const counts = search.data?.counts ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ProjectBreadcrumb items={[{ label: "Search" }]} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search the record</h1>
        <p className="text-muted-foreground">
          Diary days, hold-ups, photo notes, issued reports and programme
          activities on this project. Try an activity, a test, a material,
          a reference code or a phrase in quotes.
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. CBR test, "scaffold lift", drainage, EW-012'
          className="h-11 pl-9 text-base"
          aria-label="Search this project's records"
        />
      </div>

      {q.length >= 2 && search.data && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={`rounded-full border px-3 py-1 ${filter === null ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            All {search.data.hits.length}
          </button>
          {Object.entries(KIND).map(([kind, k]) =>
            counts[kind] ? (
              <button
                key={kind}
                type="button"
                onClick={() => setFilter(filter === kind ? null : kind)}
                className={`rounded-full border px-3 py-1 ${filter === kind ? "bg-foreground text-background" : "hover:bg-muted"}`}
              >
                {k.label} {counts[kind]}
              </button>
            ) : null
          )}
        </div>
      )}

      {q.length >= 2 && search.isLoading && (
        <div className="h-32 animate-pulse rounded-lg border bg-muted" />
      )}

      {q.length >= 2 && search.data && hits.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing on the record matches &ldquo;{q}&rdquo;. Search looks at
          locked and draft diary days, hold-up notes, photo captions and
          filenames, issued report narrative, activity names, and defect
          register items.
        </div>
      )}

      {hits.length > 0 && (
        <ul className="space-y-2">
          {hits.map((h, i) => {
            const k = KIND[h.kind] ?? KIND.task;
            const Icon = k.icon;
            return (
              <li key={`${h.kind}-${h.href}-${i}`}>
                <Link
                  href={h.href}
                  className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Icon className="h-3 w-3" />
                      {k.label}
                    </Badge>
                    {h.date && (
                      <span className="text-xs font-medium tabular-nums">
                        {formatDate(h.date)}
                      </span>
                    )}
                    <span className="text-sm font-medium">{h.title}</span>
                    {h.context && (
                      <span className="text-xs text-muted-foreground">· {h.context}</span>
                    )}
                  </div>
                  <div className="mt-1">
                    <Snippet text={h.snippet} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
