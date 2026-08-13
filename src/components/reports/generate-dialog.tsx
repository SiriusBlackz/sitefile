"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pen, Sparkles, X } from "lucide-react";
import { SignaturePad } from "./signature-pad";
import {
  REPORT_SECTION_KEYS,
  REPORT_SECTION_LABELS,
  defaultSectionsForFrequency,
  type ReportSections,
} from "@/lib/report-sections";
import { REPORTING_FREQUENCY_LABELS } from "@/lib/format";

interface SignatureInput {
  role: "contractor" | "project_manager" | "client";
  name: string;
  title: string;
  imageDataUrl?: string;
}

const SIGNATURE_ROLES = [
  { role: "contractor" as const, label: "Contractor" },
  { role: "project_manager" as const, label: "Project Manager" },
  { role: "client" as const, label: "Client" },
];

/** Local YYYY-MM-DD for <input type="date"> values (not display). */
function toInputDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onGenerated: () => void;
  /** period_end of the last completed report, if any (YYYY-MM-DD). */
  lastPeriodEnd?: string | null;
}

export function GenerateDialog({
  open,
  onOpenChange,
  projectId,
  onGenerated,
  lastPeriodEnd,
}: GenerateDialogProps) {
  // Default period: day after the last completed report through today, or
  // the current month to date when no reports exist. Computed once per mount
  // (the parent remounts the dialog on each open via a key) and used by the
  // dirty check in requestClose.
  const [defaults] = useState(() => {
    const today = new Date();
    let start: Date;
    if (lastPeriodEnd) {
      start = new Date(`${lastPeriodEnd}T00:00:00`);
      start.setDate(start.getDate() + 1);
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    return { start: toInputDate(start), end: toInputDate(today) };
  });
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [password, setPassword] = useState("");
  const [signatures, setSignatures] = useState<SignatureInput[]>([]);
  const [drawingRole, setDrawingRole] = useState<string | null>(null);
  // Narrative: AI drafts once, PM edits are preserved; Re-draft is explicit.
  // Empty = the report uses the deterministic auto-written summary.
  const [narrative, setNarrative] = useState("");
  const [lastDraft, setLastDraft] = useState<string | null>(null);
  // Section recipe: defaults follow the project's reporting frequency
  // (weekly/fortnightly get the lean pack); overrides are per-run only.
  const [sectionOverrides, setSectionOverrides] = useState<Partial<ReportSections>>({});
  const { data: project } = trpc.project.get.useQuery({ id: projectId });
  const frequency = project?.reportingFrequency ?? null;
  const recipeDefaults = defaultSectionsForFrequency(frequency);
  const sections: ReportSections = { ...recipeDefaults, ...sectionOverrides };

  const generateMutation = trpc.report.generate.useMutation({
    onSuccess: () => {
      toast.success("Report generation started");
      handleClose();
      onGenerated();
    },
    onError: (err) => toast.error(err.message),
  });

  const draftMutation = trpc.report.draftNarrative.useMutation({
    onSuccess: (data) => {
      const text = data.paragraphs.join("\n\n");
      setNarrative(text);
      setLastDraft(text);
      toast.success("Narrative drafted — review and edit before generating");
    },
    onError: (err) => toast.error(err.message),
  });

  function handleDraft() {
    if (!periodStart || !periodEnd) {
      toast.error("Select the reporting period first");
      return;
    }
    if (
      narrative.trim() &&
      narrative !== lastDraft &&
      !window.confirm("Replace your edited narrative with a fresh AI draft?")
    ) {
      return;
    }
    draftMutation.mutate({ projectId, periodStart, periodEnd });
  }

  function handleClose() {
    setPeriodStart(defaults.start);
    setPeriodEnd(defaults.end);
    setPassword("");
    setSignatures([]);
    setDrawingRole(null);
    setSectionOverrides({});
    setNarrative("");
    setLastDraft(null);
    onOpenChange(false);
  }

  // Escape / backdrop click / X / Cancel all route through here so
  // entered setup (including drawn signatures) is never silently lost.
  function requestClose() {
    const isDirty =
      periodStart !== defaults.start ||
      periodEnd !== defaults.end ||
      password !== "" ||
      narrative.trim() !== "" ||
      REPORT_SECTION_KEYS.some(
        (key) => sections[key] !== recipeDefaults[key]
      ) ||
      signatures.some((s) => s.name.trim() || s.title.trim() || s.imageDataUrl);
    if (isDirty && !window.confirm("Discard report setup?")) return;
    handleClose();
  }

  function handleGenerate() {
    if (!periodStart || !periodEnd) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (periodEnd < periodStart) {
      toast.error("End date must be after start date");
      return;
    }
    const validSignatures = signatures
      .filter((s) => s.name.trim())
      .map((s) => ({
        role: s.role,
        name: s.name.trim(),
        title: s.title.trim() || undefined,
        date: new Date().toISOString().split("T")[0],
        imageDataUrl: s.imageDataUrl,
      }));

    const narrativeParagraphs = narrative
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    generateMutation.mutate({
      projectId,
      periodStart,
      periodEnd,
      password: password || undefined,
      // Send the fully resolved set, not just overrides — the server
      // falls back to its own recipe, and this pins what the user saw.
      sections,
      narrative: narrativeParagraphs.length > 0 ? narrativeParagraphs : undefined,
      signatures: validSignatures.length > 0 ? validSignatures : undefined,
    });
  }

  function getSignature(role: string) {
    return signatures.find((s) => s.role === role);
  }

  function updateSignature(role: string, update: Partial<SignatureInput>) {
    setSignatures((prev) => {
      const existing = prev.find((s) => s.role === role);
      if (existing) {
        return prev.map((s) => (s.role === role ? { ...s, ...update } : s));
      }
      return [...prev, { role: role as SignatureInput["role"], name: "", title: "", ...update }];
    });
  }

  function removeSignatureImage(role: string) {
    updateSignature(role, { imageDataUrl: undefined });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Progress Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="period-start">Period Start *</Label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-end">Period End *</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          {periodStart && periodEnd && periodStart === periodEnd && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              This covers a single day. A first report to a client usually
              covers the project so far — consider setting the start date back
              to the start of works.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="report-narrative">Narrative (optional)</Label>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleDraft}
                disabled={draftMutation.isPending}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                {draftMutation.isPending
                  ? "Drafting..."
                  : lastDraft
                    ? "Re-draft"
                    : "Draft with AI"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Drafts professional report prose from your programme and evidence
              for the selected period — review and edit it freely before
              generating. Leave blank to use the standard auto-written summary.
            </p>
            {(narrative !== "" || lastDraft !== null) && (
              <Textarea
                id="report-narrative"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={10}
                placeholder="Narrative paragraphs, separated by blank lines"
              />
            )}
          </div>

          <div className="space-y-3">
            <Label>Report sections</Label>
            <p className="text-xs text-muted-foreground">
              Pre-set for{" "}
              {(frequency && REPORTING_FREQUENCY_LABELS[frequency]?.toLowerCase()) ||
                "monthly"}{" "}
              reporting — untick anything to leave it out of this report. Cover
              page and Executive Summary are always included.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {REPORT_SECTION_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={sections[key]}
                    onCheckedChange={(checked) =>
                      setSectionOverrides((prev) => ({
                        ...prev,
                        [key]: checked === true,
                      }))
                    }
                  />
                  {REPORT_SECTION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-password">Report password (optional)</Label>
            <Input
              id="report-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for no password"
            />
            <p className="text-xs text-muted-foreground">
              If set, the PDF itself is encrypted — this password is needed to
              download the report from Sitefile and to open the file wherever
              it&apos;s sent. It can&apos;t be recovered later, so keep a note of it.
            </p>
          </div>

          {/* Signatures Section */}
          <div className="space-y-3">
            <Label>Sign-off page (optional)</Label>
            <p className="text-xs text-muted-foreground">
              A typed name only pre-fills the block for wet-ink signing after
              printing. Draw a signature to mark the block as digitally signed.
            </p>

            {SIGNATURE_ROLES.map(({ role, label }) => {
              const sig = getSignature(role);
              const isDrawing = drawingRole === role;

              return (
                <div key={role} className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      placeholder="Name"
                      value={sig?.name ?? ""}
                      onChange={(e) => updateSignature(role, { name: e.target.value })}
                    />
                    <Input
                      placeholder="Title (optional)"
                      value={sig?.title ?? ""}
                      onChange={(e) => updateSignature(role, { title: e.target.value })}
                    />
                  </div>

                  {isDrawing ? (
                    <SignaturePad
                      onSave={(dataUrl) => {
                        updateSignature(role, { imageDataUrl: dataUrl });
                        setDrawingRole(null);
                      }}
                      onCancel={() => setDrawingRole(null)}
                    />
                  ) : sig?.imageDataUrl ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signature preview */}
                      <img
                        src={sig.imageDataUrl}
                        alt="Signature"
                        className="h-10 rounded border bg-white px-2"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSignatureImage(role)}
                        type="button"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDrawingRole(role)}
                        type="button"
                      >
                        <Pen className="mr-1 h-3.5 w-3.5" />
                        Redraw
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDrawingRole(role)}
                        type="button"
                        disabled={!sig?.name}
                      >
                        <Pen className="mr-1 h-3.5 w-3.5" />
                        Draw Signature
                      </Button>
                      {!sig?.name && (
                        <p className="text-xs text-muted-foreground">
                          Enter a name above to enable signature drawing.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !periodStart || !periodEnd}
          >
            {generateMutation.isPending ? "Generating..." : "Generate Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
