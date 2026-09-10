"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtGbp } from "@/server/services/commercial-import";
import { FileUp } from "lucide-react";

const KIND_LABEL = { ew: "Early Warning register", ce: "Compensation Event register" } as const;

/**
 * Import a CEMAR register CSV: pick the file → preview (kind detected from
 * the columns, counts, warnings) → import. Import replaces the project's
 * rows of that kind; the previous import stays in the audit log.
 */
export function ImportRegisterDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const preview = trpc.commercial.preview.useMutation({ onError: (e) => toast.error(e.message) });
  const doImport = trpc.commercial.import.useMutation({
    onSuccess: (r) => {
      toast.success(`${KIND_LABEL[r.kind]} imported — ${r.rowCount} rows${r.replaced ? `, replaced ${r.replaced}` : ""}`);
      utils.commercial.list.invalidate({ projectId });
      utils.commercial.summary.invalidate({ projectId });
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const reset = () => { setCsv(null); setFilename(""); preview.reset(); };

  const pick = async (file: File) => {
    const text = await file.text();
    setCsv(text);
    setFilename(file.name);
    preview.mutate({ projectId, csv: text });
  };

  const p = preview.data;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import CEMAR register</DialogTitle>
          <DialogDescription>
            Export the EW or CE register from CEMAR as CSV and drop it here. The file&apos;s columns tell us which register it is. Importing replaces the current rows of that register.
          </DialogDescription>
        </DialogHeader>
        <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
        {!csv ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pick(f); }}
            className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/40"
          >
            <FileUp className="h-6 w-6" />
            Choose a CSV or drop it here
          </button>
        ) : preview.isPending ? (
          <p className="text-sm text-muted-foreground">Reading {filename}…</p>
        ) : p ? (
          <div className="space-y-3 text-sm">
            <p><b>{KIND_LABEL[p.kind]}</b> · {p.rowCount} rows · {filename}</p>
            {"open" in p.summary ? (
              <p className="text-muted-foreground">{p.summary.open} open · {p.summary.avoided} avoided / passed · replies {p.summary.repliedOnTime} on time, {p.summary.repliedLate} late, {p.summary.awaitingReply} awaiting, {p.summary.replyOverdue} overdue</p>
            ) : (
              <p className="text-muted-foreground">{p.summary.implemented} implemented ({fmtGbp(p.summary.implementedValue)}, {p.summary.implementedDays} days) · {p.summary.outstanding} outstanding ({fmtGbp(p.summary.outstandingValue)}) · {p.summary.draft} draft</p>
            )}
            <ul className="space-y-0.5 text-xs">
              {p.sample.map((s) => <li key={s.ref} className="flex gap-2"><span className="font-mono font-semibold">{s.ref}</span><span className="min-w-0 flex-1 truncate">{s.title}</span><span className="text-muted-foreground">{s.notifiedOn ?? ""}</span></li>)}
              {p.rowCount > p.sample.length && <li className="text-muted-foreground">and {p.rowCount - p.sample.length} more</li>}
            </ul>
            {p.warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                {p.warnings.slice(0, 6).map((w, i) => <p key={i}>{w}</p>)}
                {p.warnings.length > 6 && <p>and {p.warnings.length - 6} more</p>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not read {filename}. Pick another file.</p>
        )}
        <DialogFooter>
          {csv && <Button variant="ghost" onClick={reset}>Choose another file</Button>}
          <Button disabled={!csv || !p || doImport.isPending} onClick={() => csv && doImport.mutate({ projectId, csv, filename })}>
            {doImport.isPending ? "Importing…" : p ? `Import ${p.rowCount} rows` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
