"use client";

import { useEffect, useState } from "react";
import { CloudOff, Cloud, Loader2, AlertCircle, RotateCw } from "lucide-react";
import { getQueue } from "@/lib/offline-queue";
import { processOfflineQueue } from "@/lib/offline-queue-processor";
import { usePWA } from "@/lib/use-pwa";
import { toast } from "sonner";

interface QueueState {
  pending: number;
  errored: number;
}

export function OfflineQueueIndicator() {
  const [counts, setCounts] = useState<QueueState>({ pending: 0, errored: 0 });
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { isOnline } = usePWA();

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const all = await getQueue();
        if (!mounted) return;
        let pending = 0;
        let errored = 0;
        for (const item of all) {
          if (item.status === "pending" || item.status === "uploading") pending++;
          else if (item.status === "error") errored++;
        }
        setCounts({ pending, errored });
      } catch {
        // IndexedDB may not be available
      }
    }

    poll();
    const interval = setInterval(poll, 5000);

    const onOnline = () => {
      poll();
      // Surface a toast so the field user sees that sync is happening —
      // offline capture is the loneliest UX, this confirms it's working.
      getQueue()
        .then((all) => {
          const pending = all.filter(
            (i) => i.status === "pending" || i.status === "uploading"
          ).length;
          if (pending > 0) {
            toast.message(
              `Back online — re-syncing ${pending} photo${pending !== 1 ? "s" : ""}`
            );
          }
        })
        .catch(() => {});
    };
    const onQueueProcess = () => poll();
    const onSyncStart = () => setSyncing(true);
    const onSyncEnd = (e: Event) => {
      setSyncing(false);
      poll();
      const detail = (e as CustomEvent<{ succeeded: number; failed: number }>)
        .detail;
      if (detail?.succeeded && detail.succeeded > 0) {
        toast.success(
          `${detail.succeeded} photo${detail.succeeded !== 1 ? "s" : ""} synced`
        );
      }
      if (detail?.failed && detail.failed > 0) {
        toast.error(
          `${detail.failed} photo${detail.failed !== 1 ? "s" : ""} failed to sync — tap the indicator to retry`
        );
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("process-offline-queue", onQueueProcess);
    window.addEventListener("queue-sync-start", onSyncStart);
    window.addEventListener("queue-sync-end", onSyncEnd as EventListener);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("process-offline-queue", onQueueProcess);
      window.removeEventListener("queue-sync-start", onSyncStart);
      window.removeEventListener("queue-sync-end", onSyncEnd as EventListener);
    };
  }, []);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      // Reset errored items back to pending so the processor will retry them.
      const { getQueue: getAll, updateQueueItem } = await import(
        "@/lib/offline-queue"
      );
      const all = await getAll();
      for (const item of all) {
        if (item.status === "error") {
          await updateQueueItem(item.id, { status: "pending", error: undefined });
        }
      }
      await processOfflineQueue();
    } finally {
      setRetrying(false);
    }
  }

  const total = counts.pending + counts.errored;
  if (total === 0 && !syncing) return null;

  if (syncing) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing {counts.pending}…
      </div>
    );
  }

  if (counts.errored > 0) {
    return (
      <button
        onClick={retry}
        disabled={retrying || !isOnline}
        className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-200 disabled:opacity-60 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
        aria-label={`${counts.errored} sync failures — tap to retry`}
      >
        {retrying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" />
        )}
        {counts.errored} failed
        <RotateCw className="ml-0.5 h-3 w-3 opacity-70" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      {isOnline ? (
        <Cloud className="h-3.5 w-3.5" />
      ) : (
        <CloudOff className="h-3.5 w-3.5" />
      )}
      {counts.pending} pending
    </div>
  );
}
