"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FileUp, AlertCircle, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onImportComplete: () => void;
}

interface ParsedTaskPreview {
  sourceRef: string;
  name: string;
  parentSourceRef: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  progressPct: number;
  sortOrder: number;
}

interface PreviewData {
  format: string;
  tasks: ParsedTaskPreview[];
  confidence?: number;
}

interface ColumnMapping {
  name: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  progressPct: string | null;
  wbs: string | null;
  parent: string | null;
}

interface MappingStep {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

const NONE = "__none__";

export function ImportDialog({
  open,
  onOpenChange,
  projectId,
  onImportComplete,
}: ImportDialogProps) {
  // Source data — only one of (clientFormat, xlsxBase64, pdfBase64) is set
  // at a time. XML is parsed IN THE BROWSER so large real-world exports
  // never travel to the server — only the extracted tasks do.
  const [clientFormat, setClientFormat] = useState<"msproject" | "p6" | null>(null);
  const [xlsxBase64, setXlsxBase64] = useState<string>("");
  const [pdfBase64, setPdfBase64] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");

  // Wizard state
  const [mappingStep, setMappingStep] = useState<MappingStep | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const [clearExisting, setClearExisting] = useState(false);
  // Two-step confirm: clearing tasks cascades away every evidence-to-task
  // link, so when the project has linked evidence the first Import click
  // only reveals the link count and asks again.
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Evidence-to-task link count, derived client-side from the Gantt markers
  // API (each marker row is a task+date group with a link count).
  const { data: evidenceMarkers = [] } = trpc.evidence.markers.useQuery(
    { projectId },
    { enabled: open }
  );
  const linkedEvidenceCount = evidenceMarkers.reduce(
    (sum, m) => sum + m.count,
    0
  );

  // Baseline behaviour copy — the first import is snapshotted as the
  // accepted baseline; re-imports only replace the current programme.
  const { data: baselineInfo } = trpc.task.baselineInfo.useQuery(
    { projectId },
    { enabled: open }
  );

  const previewMutation = trpc.task.previewImport.useMutation({
    onSuccess: (data) => {
      setError("");
      if (data.kind === "needs_mapping") {
        setMappingStep({
          headers: data.headers,
          sampleRows: data.sampleRows,
          totalRows: data.totalRows,
        });
        setMapping(data.suggested);
      } else {
        setPreview({
          format: data.format,
          tasks: data.tasks,
          confidence: "confidence" in data ? data.confidence : undefined,
        });
        setMappingStep(null);
      }
    },
    onError: (err) => {
      setError(friendlyError(err.message));
      setPreview(null);
      setMappingStep(null);
    },
  });

  const [importedCount, setImportedCount] = useState<number | null>(null);

  const importMutation = trpc.task.import.useMutation({
    onSuccess: (data) => {
      // Explicit completion step — the dialog confirms what happened and
      // waits for Done rather than vanishing under the user.
      setImportedCount(data.imported);
      onImportComplete();
    },
    // Keep the error visible in the dialog — a toast alone disappears
    // before the user can read (or screenshot) it.
    onError: (err) => setError(friendlyError(err.message)),
  });

  // Excel/PDF still travel to the server (Excel needs the mapping flow,
  // PDF needs Claude), so they keep a size cap under Vercel's 4.5MB body
  // limit. XML has no cap — it is parsed right here in the browser.
  const MAX_SERVER_FILE_BYTES = 3 * 1024 * 1024;

  function friendlyError(message: string): string {
    if (/unexpected token|not valid json|json\.parse|<!doctype|<html/i.test(message)) {
      return "The server had a problem processing this file — it may have timed out. Try again in a moment; if it keeps happening, tell us at support@sitefile.app.";
    }
    return message;
  }

  async function parseXmlLocally(file: File) {
    try {
      const xml = await file.text();
      const { detectAndParse } = await import("@/lib/programme-parse");
      const result = detectAndParse(xml);
      setClientFormat(result.format === "p6" ? "p6" : "msproject");
      setPreview({ format: result.format, tasks: result.tasks });
      setMappingStep(null);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not parse this file as an MS Project or P6 XML export."
      );
      setPreview(null);
      setMappingStep(null);
    }
  }

  function handleFileSelect(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");

    const isXlsx = /\.xlsx$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name);

    if (!isXlsx && !isPdf) {
      // XML: parsed client-side, no size limit
      void parseXmlLocally(file);
      return;
    }

    if (file.size > MAX_SERVER_FILE_BYTES) {
      setError(
        `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit for ${isPdf ? "PDF" : "Excel"} files is 3MB. ${isPdf ? "Try a lighter export (fewer embedded images), or an XML export of the same programme." : "Try removing embedded images or exporting the data sheet alone."}`
      );
      setPreview(null);
      setMappingStep(null);
      return;
    }

    const reader = new FileReader();
    if (isXlsx) {
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== "string") return;
        const b64 = result.split(",")[1] ?? "";
        setXlsxBase64(b64);
        previewMutation.mutate({ kind: "xlsx-inspect", xlsxBase64: b64 });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== "string") return;
        const b64 = result.split(",")[1] ?? "";
        setPdfBase64(b64);
        previewMutation.mutate({ kind: "pdf", pdfBase64: b64 });
      };
      reader.readAsDataURL(file);
    }
  }

  function handleConfirmMapping() {
    if (!mapping || !xlsxBase64) return;
    if (!mapping.name) {
      toast.error("Pick a column for Task Name.");
      return;
    }
    previewMutation.mutate({
      kind: "xlsx-parse",
      xlsxBase64,
      mapping,
    });
  }

  function handleImport() {
    if (clearExisting && linkedEvidenceCount > 0 && !confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (clientFormat && preview) {
      const tasksToImport = preview.tasks.map((t, i) => ({ ...t, sortOrder: i }));
      importMutation.mutate({
        projectId,
        clearExisting,
        source: { kind: "tasks", format: clientFormat, tasks: tasksToImport },
      });
    } else if (xlsxBase64 && mapping) {
      importMutation.mutate({
        projectId,
        clearExisting,
        source: { kind: "xlsx", xlsxBase64, mapping },
      });
    } else if (pdfBase64 && preview) {
      // PDF: send the (potentially edited) tasks back. Re-index sortOrder.
      const tasksToImport = preview.tasks.map((t, i) => ({
        ...t,
        sortOrder: i,
      }));
      importMutation.mutate({
        projectId,
        clearExisting,
        source: { kind: "pdf", tasks: tasksToImport },
      });
    }
  }

  function handleClose() {
    setImportedCount(null);
    setClientFormat(null);
    setXlsxBase64("");
    setPdfBase64("");
    setFileName("");
    setMappingStep(null);
    setMapping(null);
    setPreview(null);
    setError("");
    setClearExisting(false);
    setConfirmClear(false);
    onOpenChange(false);
  }

  function updatePreviewTask(
    sourceRef: string,
    field: keyof ParsedTaskPreview,
    value: string | number | null
  ) {
    if (!preview) return;
    setPreview({
      ...preview,
      tasks: preview.tasks.map((t) =>
        t.sourceRef === sourceRef ? { ...t, [field]: value } : t
      ),
    });
  }

  function deletePreviewTask(sourceRef: string) {
    if (!preview) return;
    setPreview({
      ...preview,
      tasks: preview.tasks.filter((t) => t.sourceRef !== sourceRef),
    });
  }

  /**
   * Import hygiene — programmes exported from planning tools routinely
   * carry resource/owner codes ("MCL", "MAG"), placeholder rows ("TBC")
   * and duplicated rows as if they were activities. They sail straight
   * into the client-facing Gantt and milestone tables unless the PM
   * drops them here.
   */
  function suspectReason(
    task: ParsedTaskPreview,
    all: ParsedTaskPreview[]
  ): string | null {
    const name = task.name.trim();
    if (/^(tbc|tbd|n\/?a|x+)$/i.test(name)) return "Placeholder name";
    if (/^[A-Z]{2,5}$/.test(name))
      return "Looks like a resource or owner code, not an activity";
    const tokens = name.split(/[/,&]+/).map((s) => s.trim()).filter(Boolean);
    if (
      tokens.length > 1 &&
      tokens.every((t) => t.length <= 14) &&
      tokens.some((t) => /^[A-Z]{2,5}$/.test(t))
    )
      return "Reads like a list of resources, not an activity";
    const dupe = all.find(
      (t) =>
        t.sourceRef !== task.sourceRef &&
        t.name.trim() === name &&
        t.plannedStart === task.plannedStart &&
        t.plannedEnd === task.plannedEnd &&
        all.indexOf(t) < all.indexOf(task)
    );
    if (dupe) return "Duplicate of another row (same name and dates)";
    return null;
  }

  function getDepth(
    task: ParsedTaskPreview,
    allTasks: ParsedTaskPreview[]
  ): number {
    let depth = 0;
    let current = task;
    const seen = new Set<string>();
    while (current.parentSourceRef && !seen.has(current.sourceRef)) {
      seen.add(current.sourceRef);
      const parent = allTasks.find(
        (t) => t.sourceRef === current.parentSourceRef
      );
      if (!parent) break;
      depth++;
      current = parent;
    }
    return depth;
  }

  const formatLabel: Record<string, string> = {
    msproject: "MS Project",
    p6: "Primavera P6",
    xlsx: "Excel",
    pdf: "PDF (AI-extracted)",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* flex-col + min-h-0 scroll regions keep the footer visible while
          long step content scrolls internally instead of clipping. */}
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Programme</DialogTitle>
        </DialogHeader>

        {/* Step 1: file picker */}
        {!mappingStep && !preview && !error && !previewMutation.isPending && importedCount === null && (
          <div className="space-y-3">
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {fileName ||
                  "Select your programme: MS Project / P6 (XML export), Excel (.xlsx), or PDF"}
              </p>
              <p className="text-xs text-muted-foreground/70">
                MS Project: File → Save As → XML. Primavera P6: File → Export →
                XML. PDF uses AI extraction (10–30s).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.xlsx,.pdf"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>
          </div>
        )}

        {previewMutation.isPending && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <div className="text-sm font-medium">
              {pdfBase64
                ? "Reading the programme with AI…"
                : xlsxBase64
                  ? "Reading spreadsheet…"
                  : "Parsing XML…"}
            </div>
            {pdfBase64 && (
              <div className="text-xs text-muted-foreground">
                {fileName} — this usually takes 30–60 seconds. Keep this
                window open.
              </div>
            )}
          </div>
        )}

        {error &&
          (/visual programme/i.test(error) ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  This file needs a different route
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Import failed
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ))}

        {/* Success — explicit completion step */}
        {importedCount !== null && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <span className="text-2xl text-green-600 dark:text-green-400">✓</span>
            </div>
            <div className="text-base font-semibold">
              {importedCount} tasks imported
            </div>
            <p className="text-sm text-muted-foreground">
              Your programme is loaded — dates, hierarchy and progress
              included.
            </p>
            {/* Forward motion lives in the footer (Next step / Save and
                continue later) — the body only offers the overview. */}
            <Link
              href={`/projects/${projectId}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")}
            >
              See all steps
            </Link>
          </div>
        )}

        {/* Step 2: column mapping (xlsx only) */}
        {mappingStep && mapping && !preview && importedCount === null && (
          <div className="space-y-4 min-h-0 overflow-y-auto">
            <div className="text-sm">
              <Badge variant="secondary">Excel</Badge>
              <span className="text-muted-foreground ml-2">
                {mappingStep.totalRows} data rows in {fileName}. Map your
                columns:
              </span>
            </div>

            <div className="space-y-2">
              <MappingRow
                label="Task name *"
                required
                headers={mappingStep.headers}
                value={mapping.name}
                onChange={(v) => setMapping({ ...mapping, name: v ?? "" })}
              />
              <MappingRow
                label="Start date"
                headers={mappingStep.headers}
                value={mapping.plannedStart}
                onChange={(v) =>
                  setMapping({ ...mapping, plannedStart: v ?? null })
                }
              />
              <MappingRow
                label="End date"
                headers={mappingStep.headers}
                value={mapping.plannedEnd}
                onChange={(v) =>
                  setMapping({ ...mapping, plannedEnd: v ?? null })
                }
              />
              <MappingRow
                label="% Complete"
                headers={mappingStep.headers}
                value={mapping.progressPct}
                onChange={(v) =>
                  setMapping({ ...mapping, progressPct: v ?? null })
                }
              />
              <MappingRow
                label="WBS code"
                hint="Used for hierarchy (e.g. 1.1, 1.1.2)"
                headers={mappingStep.headers}
                value={mapping.wbs}
                onChange={(v) => setMapping({ ...mapping, wbs: v ?? null })}
              />
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Sample rows</summary>
              <div className="mt-2 overflow-x-auto rounded-lg border max-h-40">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {mappingStep.headers.map((h) => (
                        <TableHead key={h} className="text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappingStep.sampleRows.map((row, i) => (
                      <TableRow key={i}>
                        {mappingStep.headers.map((h) => (
                          <TableCell key={h} className="text-xs">
                            {row[h] ?? ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </div>
        )}

        {/* Step 3: preview */}
        {preview && importedCount === null && (
          <div className="space-y-4 min-h-0 overflow-y-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">
                {formatLabel[preview.format] ?? preview.format}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {preview.tasks.length} tasks found in {fileName}
              </span>
              {preview.format === "pdf" && (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI extracted
                </Badge>
              )}
            </div>

            {preview.format === "pdf" &&
              typeof preview.confidence === "number" &&
              preview.confidence < 0.7 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      AI confidence:{" "}
                      {preview.confidence < 0.4 ? "Low" : "Medium"}
                    </p>
                    <p className="text-amber-800 dark:text-amber-300/90 mt-0.5">
                      Review every row carefully — the source PDF was difficult
                      to read. Edit fields below or delete bad rows before
                      importing.
                    </p>
                  </div>
                </div>
              )}

            {preview.format === "pdf" && (
              <p className="text-xs text-muted-foreground">
                Click any cell to edit. Use 🗑 to drop bad rows. Hierarchy is
                preserved from the AI extraction.
              </p>
            )}

            {(() => {
              const flagged = preview.tasks.filter((t) =>
                suspectReason(t, preview.tasks)
              );
              // xlsx re-parses server-side from the file, so row removal
              // only applies to the XML / PDF paths.
              const canRemove = preview.format !== "xlsx";
              if (flagged.length === 0) return null;
              return (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      {flagged.length} row{flagged.length === 1 ? "" : "s"}{" "}
                      {flagged.length === 1 ? "doesn't" : "don't"} look like
                      real activities
                    </p>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-300/90">
                      Resource codes, placeholders and duplicates print
                      straight into the client report&apos;s programme and
                      milestone tables. Flagged rows are marked ⚑ below — keep
                      any that are genuine.
                    </p>
                    {canRemove && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 border-amber-400 text-amber-900 hover:bg-amber-100 dark:text-amber-200"
                        onClick={() =>
                          setPreview({
                            ...preview,
                            tasks: preview.tasks.filter(
                              (t) => !suspectReason(t, preview.tasks)
                            ),
                          })
                        }
                      >
                        Remove all {flagged.length} flagged rows
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    {preview.format !== "xlsx" && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.tasks.map((task) => {
                    const depth = getDepth(task, preview.tasks);
                    const editable = preview.format === "pdf";
                    const flagReason = suspectReason(task, preview.tasks);
                    return (
                      <TableRow
                        key={task.sourceRef}
                        className={
                          flagReason
                            ? "bg-amber-50/60 dark:bg-amber-950/10"
                            : undefined
                        }
                      >
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            {flagReason && (
                              <span
                                title={flagReason}
                                className="shrink-0 text-amber-600 dark:text-amber-400"
                              >
                                ⚑
                              </span>
                            )}
                            {editable ? (
                              <Input
                                value={task.name}
                                onChange={(e) =>
                                  updatePreviewTask(
                                    task.sourceRef,
                                    "name",
                                    e.target.value
                                  )
                                }
                                style={{ marginLeft: `${depth * 16}px` }}
                                className="h-7 text-sm"
                              />
                            ) : (
                              <span style={{ paddingLeft: `${depth * 16}px` }}>
                                {task.name}
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {editable ? (
                            <Input
                              type="date"
                              value={task.plannedStart ?? ""}
                              onChange={(e) =>
                                updatePreviewTask(
                                  task.sourceRef,
                                  "plannedStart",
                                  e.target.value || null
                                )
                              }
                              className="h-7 text-xs"
                            />
                          ) : (
                            formatDate(task.plannedStart)
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {editable ? (
                            <Input
                              type="date"
                              value={task.plannedEnd ?? ""}
                              onChange={(e) =>
                                updatePreviewTask(
                                  task.sourceRef,
                                  "plannedEnd",
                                  e.target.value || null
                                )
                              }
                              className="h-7 text-xs"
                            />
                          ) : (
                            formatDate(task.plannedEnd)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editable ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={task.progressPct}
                              onChange={(e) =>
                                updatePreviewTask(
                                  task.sourceRef,
                                  "progressPct",
                                  Math.min(
                                    Math.max(Number(e.target.value) || 0, 0),
                                    100
                                  )
                                )
                              }
                              className="h-7 w-16 text-xs text-right ml-auto"
                            />
                          ) : (
                            `${task.progressPct}%`
                          )}
                        </TableCell>
                        {preview.format !== "xlsx" && (
                          <TableCell>
                            <button
                              onClick={() => deletePreviewTask(task.sourceRef)}
                              aria-label="Delete row"
                              className="text-muted-foreground hover:text-destructive p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground">
              {baselineInfo
                ? `Your baseline (${baselineInfo.taskCount} activities${
                    baselineInfo.setAt
                      ? `, set ${new Date(baselineInfo.setAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : ""
                  }) stays fixed — this import updates the current programme, and reports show variance against the baseline.`
                : "This first import also becomes your baseline — the accepted programme reports measure slippage against. Later re-imports update the current programme only."}
            </p>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="clear-existing"
                  checked={clearExisting}
                  onChange={(e) => {
                    setClearExisting(e.target.checked);
                    if (!e.target.checked) setConfirmClear(false);
                  }}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="clear-existing" className="text-sm font-normal">
                  Clear existing tasks before importing
                </Label>
              </div>
              <p className="pl-6 text-xs text-muted-foreground">
                Deletes every current task and permanently removes their
                evidence-to-task links. Photos stay in the evidence library but
                lose their task links.
              </p>
            </div>

            {clearExisting && confirmClear && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                <p>
                  Clearing existing tasks will permanently remove{" "}
                  <strong>
                    {linkedEvidenceCount} evidence-to-task link
                    {linkedEvidenceCount === 1 ? "" : "s"}
                  </strong>{" "}
                  in this project. Click the button again to confirm.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {importedCount === null && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {error && (
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setClientFormat(null);
                setXlsxBase64("");
                setPdfBase64("");
                setFileName("");
                setMappingStep(null);
                setMapping(null);
                setPreview(null);
              }}
            >
              Try Another File
            </Button>
          )}
          {mappingStep && !preview && (
            <Button
              onClick={handleConfirmMapping}
              disabled={previewMutation.isPending || !mapping?.name}
            >
              {previewMutation.isPending ? "Reading..." : "Preview tasks"}
            </Button>
          )}
          {importedCount !== null && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Save and continue later
              </Button>
              <Link
                href={`/projects/${projectId}/evidence`}
                className={cn(buttonVariants())}
              >
                Next step: add site photos →
              </Link>
            </>
          )}
          {preview && importedCount === null && (
            <Button
              variant={clearExisting && confirmClear ? "destructive" : "default"}
              onClick={handleImport}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending
                ? "Importing..."
                : clearExisting && confirmClear
                ? `Delete ${linkedEvidenceCount} Link${
                    linkedEvidenceCount === 1 ? "" : "s"
                  } & Import`
                : `Import ${preview.tasks.length} Tasks`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MappingRowProps {
  label: string;
  hint?: string;
  required?: boolean;
  headers: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}

function MappingRow({
  label,
  hint,
  required,
  headers,
  value,
  onChange,
}: MappingRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0">
        <Label className="text-sm">{label}</Label>
        {hint && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
        )}
      </div>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : (v ?? null))}
      >
        <SelectTrigger className="flex-1">
          <SelectValue
            placeholder={required ? "Pick a column..." : "Skip"}
          />
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value={NONE}>Skip</SelectItem>}
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
