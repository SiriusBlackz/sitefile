"use client";

import { useEffect, useState } from "react";
import { drainInspectionDrafts, listItemDrafts, type ItemDraft } from "@/lib/inspection-offline";

/**
 * Mount on inspection screens: drains offline item drafts on mount, on
 * `online` and on visibility, and exposes the pending drafts for display
 * ("ref pending"). Progress screens never mount this.
 */
export function useInspectionDrain(projectId: string | undefined) {
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const refresh = () => { listItemDrafts(projectId).then((d) => { if (alive) setDrafts(d.filter((x) => x.status !== "done")); }); };
    const drain = () => { drainInspectionDrafts().finally(refresh); };
    refresh();
    if (navigator.onLine) drain();
    window.addEventListener("online", drain);
    window.addEventListener("inspection-drafts-changed", refresh);
    const onVis = () => { if (document.visibilityState === "visible" && navigator.onLine) drain(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.removeEventListener("online", drain); window.removeEventListener("inspection-drafts-changed", refresh); document.removeEventListener("visibilitychange", onVis); };
  }, [projectId]);
  return drafts;
}
