"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listStashedCaptures,
  clearStashedCapture,
  type CaptureStaging,
} from "@/lib/offline-queue";
import { Camera, X } from "lucide-react";

/**
 * Surfaces unfinished capture sessions (photos shot but never uploaded,
 * sitting in the phone's local stash). Photos must never be silently
 * invisible — this is the recovery path for "where did my photos go?".
 */
export function ResumeCaptureBanner({
  projectId,
  currentSessionId,
  dark = false,
}: {
  /** Fallback project for stashes written before projectId was recorded. */
  projectId?: string;
  /** Session currently being worked on — excluded from the banner. */
  currentSessionId?: string;
  dark?: boolean;
}) {
  const router = useRouter();
  const [stashes, setStashes] = useState<CaptureStaging[]>([]);

  useEffect(() => {
    let cancelled = false;
    listStashedCaptures()
      .then((all) => {
        if (cancelled) return;
        setStashes(all.filter((s) => s.sessionId !== currentSessionId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

  const stash = stashes[0];
  if (!stash || stash.photos.length === 0) return null;
  const targetProject = stash.projectId ?? projectId;
  if (!targetProject) return null;

  const count = stash.photos.length;

  return (
    <div
      role="status"
      className={
        dark
          ? "flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-amber-300"
          : "flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300"
      }
    >
      <Camera className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 text-xs font-medium">
        {count} photo{count === 1 ? "" : "s"} from an unfinished capture —
        they&apos;re safe on this phone, not uploaded yet.
      </span>
      <button
        onClick={() =>
          router.push(
            `/capture/review?projectId=${targetProject}&session=${stash.sessionId}`
          )
        }
        className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground active:brightness-95"
      >
        Resume
      </button>
      <button
        aria-label="Discard unfinished capture"
        onClick={async () => {
          await clearStashedCapture(stash.sessionId).catch(() => {});
          setStashes((prev) => prev.filter((s) => s.sessionId !== stash.sessionId));
        }}
        className="shrink-0 p-1 opacity-70 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
