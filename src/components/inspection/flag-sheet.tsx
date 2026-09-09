"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { X } from "lucide-react";

const FLAGS: { key: "disputed" | "access_blocked" | "awaiting_test"; label: string; hint: string }[] = [
  { key: "access_blocked", label: "Access blocked", hint: "Traffic management, permit, possession or land access needed" },
  { key: "awaiting_test", label: "Awaiting test or record", hint: "Closure depends on a test result or inspection record" },
  { key: "disputed", label: "Disputed", hint: "The responsible party does not accept this item" },
];

/** Set or clear one of the three flags. Flags never change the status. */
export function FlagSheet({ itemId, flags, onClose, onDone }: { itemId: string; flags: Record<string, unknown>; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const setFlag = trpc.inspection.setFlag.useMutation({ onSuccess: () => { toast.success("Flag set"); onDone(); }, onError: (e) => toast.error(e.message) });
  const clearFlag = trpc.inspection.clearFlag.useMutation({ onSuccess: () => { toast.success("Flag cleared"); onDone(); }, onError: (e) => toast.error(e.message) });
  const busy = setFlag.isPending || clearFlag.isPending;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-background p-4 pb-8 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between">
          <h2 className="text-lg font-bold">Flags</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">Flags mark an unresolved item; they are subsets on the report, never a closure.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (required to set a flag)" className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        <div className="space-y-2">
          {FLAGS.map((f) => {
            const on = Boolean(flags[f.key]);
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{f.label}{on ? " · set" : ""}</div>
                  <div className="text-xs text-muted-foreground">{f.hint}</div>
                </div>
                {on ? (
                  <button type="button" disabled={busy} onClick={() => clearFlag.mutate({ itemId, flag: f.key, note: reason.trim() || undefined })} className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium">Clear</button>
                ) : (
                  <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => setFlag.mutate({ itemId, flag: f.key, reason: reason.trim() })} className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50">Set</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
