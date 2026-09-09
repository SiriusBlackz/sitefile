"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { X } from "lucide-react";

/** Terminal dispositions: accepted as-is (needs a reference) or void. */
export function DispositionSheet({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState<"accepted_as_is" | "void">("accepted_as_is");
  const [reference, setReference] = useState("");
  const mutation = trpc.inspection.disposition.useMutation({ onSuccess: () => { toast.success(to === "void" ? "Item voided" : "Accepted as-is recorded"); onDone(); }, onError: (e) => toast.error(e.message) });
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-background p-4 pb-8 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between">
          <h2 className="text-lg font-bold">Final disposition</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">These end the item without a repair. They need a reference (a PM decision, an instruction, or the duplicate&apos;s ref) and print under Formal decisions.</p>
        <div className="mb-3 flex gap-2">
          {(["accepted_as_is", "void"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTo(k)} className={`flex-1 rounded-lg border px-3 py-2 text-sm ${to === k ? "bg-foreground text-background" : ""}`}>{k === "void" ? "Void (raised in error)" : "Accepted as-is"}</button>
          ))}
        </div>
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={to === "void" ? "Reason, e.g. duplicate of DEF-0003" : "Reference, e.g. PM decision / instruction no."} className="mb-3 h-11 w-full rounded-lg border bg-background px-3 text-sm" />
        <button type="button" disabled={mutation.isPending || reference.trim().length < 3} onClick={() => mutation.mutate({ itemId, to, reference: reference.trim() })} className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {mutation.isPending ? "Saving…" : "Record disposition"}
        </button>
      </div>
    </div>
  );
}
