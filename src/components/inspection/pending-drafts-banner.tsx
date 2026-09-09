"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useInspectionDrain } from "./use-inspection-drain";
import { drainInspectionDrafts, removeItemDraft } from "@/lib/inspection-offline";
import { toast } from "sonner";

/**
 * Items saved on the phone that have not reached the server yet. Mounting
 * this also drains them (mount / online / visibility). Renders nothing when
 * there are none, so progress-style screens show no change.
 */
export function PendingDraftsBanner({ projectId }: { projectId: string }) {
  const drafts = useInspectionDrain(projectId);
  if (drafts.length === 0) return null;
  const errors = drafts.filter((d) => d.status === "error");
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <div className="flex items-center gap-2">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          {drafts.length} item{drafts.length === 1 ? "" : "s"} saved on this phone · ref pending. Open once with signal to sync.
        </span>
        <button
          type="button"
          aria-label="Sync now"
          onClick={() => drainInspectionDrafts().then((r) => toast.message(r.synced > 0 ? `${r.synced} synced` : navigator.onLine ? "Nothing synced yet" : "Still no signal"))}
          className="rounded-full border border-amber-300 p-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{String(d.payload.title ?? "Untitled")}</span>
              <span className="text-amber-800/70"> · {d.photos.length} photo{d.photos.length === 1 ? "" : "s"}</span>
              {d.status === "error" && <span className="text-red-700"> · {d.error}</span>}
            </span>
            {d.status === "error" && (
              <button type="button" onClick={() => removeItemDraft(d.id).then(() => window.dispatchEvent(new CustomEvent("inspection-drafts-changed")))} className="underline">
                discard
              </button>
            )}
          </li>
        ))}
      </ul>
      {errors.length > 0 && <p className="mt-1 text-[11px]">Failed items retry on the next sync; discard only if the item was recorded another way.</p>}
    </div>
  );
}
