"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { trpc } from "@/lib/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { Lightbulb, Pen, Sparkles, Type, X } from "lucide-react";
import { SignaturePad } from "./signature-pad";
import {
  REPORT_SECTION_KEYS,
  REPORT_SECTION_LABELS,
  defaultSectionsForFrequency,
  type ReportSections,
} from "@/lib/report-sections";
import { formatDate, REPORTING_FREQUENCY_LABELS } from "@/lib/format";
import type { ReportDraftPayload } from "@/lib/report-draft";

interface SignatureInput {
  role: "contractor" | "project_manager" | "client";
  name: string;
  title: string;
  imageDataUrl?: string;
}

// Only the sending side signs here. The client's block always prints as
// empty wet-ink lines — a client signature typed in by the PM would render
// as "Digitally Signed" on a contractual document, which misrepresents who
// signed it. (Remote client sign-off is a post-pilot flow.)
const SIGNATURE_ROLES = [
  { role: "contractor" as const, label: "Contractor" },
  { role: "project_manager" as const, label: "Project Manager" },
];

/**
 * Renders a typed name as a script-font signature image. Produces the same
 * imageDataUrl a drawn signature does, so the template, "Digitally Signed"
 * treatment and PDF pipeline all work unchanged.
 */
function typedSignatureDataUrl(name: string): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const family = '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';
  let fontSize = 64;
  ctx.font = `italic ${fontSize}px ${family}`;
  const maxWidth = canvas.width - 40;
  while (fontSize > 20 && ctx.measureText(name).width > maxWidth) {
    fontSize -= 4;
    ctx.font = `italic ${fontSize}px ${family}`;
  }
  ctx.fillStyle = "#1e293b";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2, maxWidth);
  return canvas.toDataURL("image/png");
}

const SAVED_SIGNATURE_KEY = "sitefile.savedSignature";

// Memorable auto-password: word-word-NN. Client-side only; sent to the
// server exactly like a typed password.
const PW_WORDS = [
  "kerb", "gully", "rebar", "gantry", "trench", "piling", "asphalt",
  "beam", "purlin", "soffit", "chainage", "culvert", "duct", "membrane",
];
function generateMemorablePassword(): string {
  const pick = () => PW_WORDS[Math.floor(Math.random() * PW_WORDS.length)];
  const a = pick();
  let b = pick();
  while (b === a) b = pick();
  return `${a}-${b}-${String(Math.floor(Math.random() * 90) + 10)}`;
}

/** Cover photo thumbnail picker — shared by setup form and preview panel. */
function CoverPhotoPicker({
  photos,
  value,
  onChange,
}: {
  photos: {
    id: string;
    thumbnailUrl: string | null;
    publicUrl: string;
    note: string | null;
    originalFilename: string | null;
  }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  if (photos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No photos in this project yet — upload site photos to choose one.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.note ?? "Site photo"}
          onClick={() => onChange(value === p.id ? null : p.id)}
          className={cn(
            "h-14 w-20 overflow-hidden rounded-md border transition-shadow",
            value === p.id
              ? "ring-2 ring-primary ring-offset-1"
              : "hover:ring-1 hover:ring-muted-foreground/40"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny thumb */}
          <img
            src={p.thumbnailUrl ?? p.publicUrl}
            alt={p.note ?? "Site photo"}
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}

/** Key issues list editor — shared by the setup form and the preview panel. */
function KeyIssuesEditor({
  keyIssues,
  setKeyIssues,
  issueDraft,
  setIssueDraft,
  idPrefix,
}: {
  keyIssues: string[];
  setKeyIssues: Dispatch<SetStateAction<string[]>>;
  issueDraft: string;
  setIssueDraft: (v: string) => void;
  idPrefix: string;
}) {
  function addDraft() {
    if (!issueDraft.trim()) return;
    setKeyIssues((prev) => [...prev, issueDraft.trim()]);
    setIssueDraft("");
  }
  return (
    <>
      {keyIssues.length > 0 && (
        <ul className="space-y-1">
          {keyIssues.map((issue, i) => (
            <li key={i} className="flex items-center gap-1">
              <Input
                value={issue}
                aria-label={`Key issue ${i + 1}`}
                onChange={(e) =>
                  setKeyIssues((prev) =>
                    prev.map((v, j) => (j === i ? e.target.value : v))
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label="Remove issue"
                onClick={() =>
                  setKeyIssues((prev) => prev.filter((_, j) => j !== i))
                }
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1">
        <Input
          id={`${idPrefix}-key-issues`}
          value={issueDraft}
          onChange={(e) => setIssueDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder="e.g. Awaiting client sign-off on window specification"
        />
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={!issueDraft.trim()}
          onClick={addDraft}
        >
          Add
        </Button>
      </div>
    </>
  );
}

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
  /** The standing draft — pre-approves narrative/issues/signature. */
  draftPayload?: ReportDraftPayload | null;
}

export function GenerateDialog({
  open,
  onOpenChange,
  projectId,
  onGenerated,
  lastPeriodEnd,
  draftPayload,
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
  const [protectPdf, setProtectPdf] = useState(true);
  const [password, setPassword] = useState(() => generateMemorablePassword());
  const [signatures, setSignatures] = useState<SignatureInput[]>(() =>
    draftPayload?.signature?.name
      ? [
          {
            role: "contractor",
            name: draftPayload.signature.name,
            title: draftPayload.signature.title ?? "",
          },
        ]
      : []
  );
  const [drawingRole, setDrawingRole] = useState<string | null>(null);
  // Typed-signature confirm step: preview the rendered script signature
  // before it's applied — mirrors the draw pad's explicit Save.
  const [typedPreview, setTypedPreview] = useState<{
    role: string;
    dataUrl: string;
  } | null>(null);
  // Narrative: AI drafts once, PM edits are preserved; Re-draft is explicit.
  // Empty = the report uses the deterministic auto-written summary.
  const [narrative, setNarrative] = useState(
    () => draftPayload?.narrative?.join("\n\n") ?? ""
  );
  const [lastDraft, setLastDraft] = useState<string | null>(null);
  // Key issues: an explicit list (seeded from programme risks, edited by
  // the PM). A separate draft input feeds it — but an un-added draft is
  // still included on generate, so typed text is never silently lost.
  const [keyIssues, setKeyIssues] = useState<string[]>(
    () => draftPayload?.keyIssues ?? []
  );
  const [issueDraft, setIssueDraft] = useState("");
  // Exec-summary Key Risks & Observations override. null = untouched (the
  // server derives them); seeded from the preview response so the PM edits
  // the real derived list rather than typing blind.
  const [keyRisksEdit, setKeyRisksEdit] = useState<string[] | null>(null);
  const [riskDraft, setRiskDraft] = useState("");
  // Health & Safety figures — all-empty means the report omits the block.
  const emptyHs = {
    accidents: "",
    nearMisses: "",
    riddor: "",
    toolboxTalks: "",
    inductions: "",
    note: "",
  };
  const [hs, setHs] = useState({ ...emptyHs });
  const hsTouched = Object.values(hs).some((v) => v.trim() !== "");

  // Cover hero photo — per report, optional; null keeps today's cover.
  const [coverEvidenceId, setCoverEvidenceId] = useState<string | null>(
    () => draftPayload?.coverEvidenceId ?? null
  );
  const { data: coverPhotoData } = trpc.evidence.list.useInfiniteQuery(
    { projectId, limit: 12, type: "photo" },
    {
      enabled: open,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }
  );
  const coverPhotos = coverPhotoData?.pages[0]?.items ?? [];
  // Section recipe: defaults follow the project's reporting frequency
  // (weekly/fortnightly get the lean pack); overrides are per-run only.
  const [sectionOverrides, setSectionOverrides] = useState<Partial<ReportSections>>({});
  const { data: project } = trpc.project.get.useQuery({ id: projectId });
  // Branding nudge: a contractor can reach this dialog without ever seeing
  // the overview checklist, so warn here before an unbranded cover ships.
  const { data: org } = trpc.org.get.useQuery(undefined, { enabled: open });
  // Live count of evidence the chosen period would pull in — the report
  // filters by capture date (upload date when EXIF gave none), so a period
  // that misses the photos would otherwise generate a silently empty report.
  const periodValid = Boolean(
    periodStart && periodEnd && periodEnd >= periodStart
  );
  const { data: evidencePreview } = trpc.report.evidencePreview.useQuery(
    { projectId, periodStart, periodEnd },
    { enabled: open && periodValid, placeholderData: (prev) => prev }
  );

  function coverAllEvidence() {
    if (!evidencePreview?.earliest || !evidencePreview.latest) return;
    setPeriodStart(
      evidencePreview.earliest < periodStart
        ? evidencePreview.earliest
        : periodStart
    );
    setPeriodEnd(
      evidencePreview.latest > periodEnd ? evidencePreview.latest : periodEnd
    );
  }
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

  // Review-before-generate: renders the real report HTML for approval.
  const [previewHtmlContent, setPreviewHtmlContent] = useState<string | null>(
    null
  );
  const previewMutation = trpc.report.previewHtml.useMutation({
    onSuccess: (data) => {
      setPreviewHtmlContent(data.html);
      setKeyRisksEdit((prev) => prev ?? data.keyRisks);
    },
    onError: (err) => toast.error(err.message),
  });

  const suggestMutation = trpc.report.keyIssueSuggestions.useMutation({
    onSuccess: (data) => {
      if (data.suggestions.length === 0) {
        toast.info("No programme risks found for this period — add issues manually");
        return;
      }
      // Append below whatever the PM already added, never overwrite.
      setKeyIssues((prev) => {
        const seen = new Set(prev);
        return [...prev, ...data.suggestions.filter((s) => !seen.has(s))];
      });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSuggestIssues() {
    if (!periodStart || !periodEnd) {
      toast.error("Select the reporting period first");
      return;
    }
    suggestMutation.mutate({ projectId, periodStart, periodEnd });
  }

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
    setTypedPreview(null);
    setSectionOverrides({});
    setNarrative("");
    setLastDraft(null);
    setKeyIssues([]);
    setIssueDraft("");
    setKeyRisksEdit(null);
    setRiskDraft("");
    setCoverEvidenceId(null);
    setHs({ ...emptyHs });
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
      keyIssues.length > 0 ||
      issueDraft.trim() !== "" ||
      REPORT_SECTION_KEYS.some(
        (key) => sections[key] !== recipeDefaults[key]
      ) ||
      coverEvidenceId !== null ||
      hsTouched ||
      signatures.some((s) => s.name.trim() || s.title.trim() || s.imageDataUrl);
    if (isDirty && !window.confirm("Discard report setup?")) return;
    handleClose();
  }

  // Shared assembly for preview and generate — both must see the exact
  // same content, or the preview stops being a promise.
  function buildReportContent() {
    if (!periodStart || !periodEnd) {
      toast.error("Please select both start and end dates");
      return null;
    }
    if (periodEnd < periodStart) {
      toast.error("End date must be after start date");
      return null;
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
    // Include an un-added draft — typed text must never silently vanish.
    const keyIssuesList = [...keyIssues, issueDraft]
      .map((l) => l.trim())
      .filter(Boolean);
    // null = never seeded/touched → let the server derive them.
    const keyRisksList =
      keyRisksEdit === null
        ? undefined
        : [...keyRisksEdit, riskDraft].map((l) => l.trim()).filter(Boolean);

    return {
      projectId,
      periodStart,
      periodEnd,
      // Send the fully resolved set, not just overrides — the server
      // falls back to its own recipe, and this pins what the user saw.
      sections,
      narrative: narrativeParagraphs.length > 0 ? narrativeParagraphs : undefined,
      keyIssues: keyIssuesList.length > 0 ? keyIssuesList : undefined,
      keyRisks: keyRisksList,
      coverEvidenceId: coverEvidenceId ?? undefined,
      healthSafety: hsTouched
        ? {
            accidents: Number(hs.accidents) || 0,
            nearMisses: Number(hs.nearMisses) || 0,
            riddor: Number(hs.riddor) || 0,
            toolboxTalks: Number(hs.toolboxTalks) || 0,
            inductions: Number(hs.inductions) || 0,
            note: hs.note.trim() || undefined,
          }
        : undefined,
      signatures: validSignatures.length > 0 ? validSignatures : undefined,
    };
  }

  function handlePreview() {
    const content = buildReportContent();
    if (!content) return;
    previewMutation.mutate(content);
  }

  function handleGenerate() {
    const content = buildReportContent();
    if (!content) return;
    if (
      evidencePreview &&
      evidencePreview.total > 0 &&
      evidencePreview.inPeriod === 0 &&
      !window.confirm(
        "No photos fall within this period — the report will have no evidence in it. Generate anyway?"
      )
    ) {
      return;
    }
    generateMutation.mutate({
      ...content,
      password: protectPdf && password ? password : undefined,
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

  // Reuse across reports: the last applied signature (typed or drawn) is
  // kept on this device only — never sent anywhere until used in a report.
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSavedSignature(localStorage.getItem(SAVED_SIGNATURE_KEY));
    } catch {
      // Storage unavailable (private mode) — feature quietly absent.
    }
  }, [open]);

  function applySignature(role: string, dataUrl: string) {
    updateSignature(role, { imageDataUrl: dataUrl });
    try {
      localStorage.setItem(SAVED_SIGNATURE_KEY, dataUrl);
      setSavedSignature(dataUrl);
    } catch {
      // Best-effort save.
    }
  }

  return (
    <>
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
          {org && !org.logoUrl && (
            <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <p>
                <strong>No company logo set</strong> — the report cover will go
                out without your branding. Adding your logo and company colour
                takes a minute.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/account"
                  target="_blank"
                  rel="noopener"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" })
                  )}
                >
                  Add company branding
                </a>
              </div>
            </div>
          )}
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
          {periodValid && evidencePreview && evidencePreview.total === 0 && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              No photos or videos have been uploaded to this project yet — the
              report will be generated without an evidence gallery.
            </p>
          )}
          {periodValid &&
            evidencePreview &&
            evidencePreview.total > 0 &&
            evidencePreview.inPeriod === 0 && (
              <div className="space-y-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                <p>
                  <strong>
                    None of your {evidencePreview.total} photos fall within
                    this period
                  </strong>{" "}
                  — the report&apos;s evidence sections will be empty. Photos
                  are placed by the date they were taken (or uploaded, when the
                  photo carries no date), and yours span{" "}
                  {formatDate(evidencePreview.earliest)} to{" "}
                  {formatDate(evidencePreview.latest)}.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={coverAllEvidence}
                >
                  Adjust period to include all photos
                </Button>
              </div>
            )}
          {periodValid &&
            evidencePreview &&
            evidencePreview.total > 0 &&
            evidencePreview.inPeriod > 0 && (
              <p
                className={
                  evidencePreview.inPeriod < evidencePreview.total
                    ? "rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
                    : "text-xs text-muted-foreground"
                }
              >
                {evidencePreview.inPeriod < evidencePreview.total ? (
                  <>
                    {evidencePreview.inPeriod} of {evidencePreview.total}{" "}
                    photos fall within this period — the other{" "}
                    {evidencePreview.total - evidencePreview.inPeriod} will be
                    left out of this report.
                  </>
                ) : (
                  <>
                    All {evidencePreview.total} photo
                    {evidencePreview.total === 1 ? "" : "s"} fall within this
                    period and will be included.
                  </>
                )}
              </p>
            )}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="report-key-issues">Key issues (optional)</Label>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleSuggestIssues}
                disabled={suggestMutation.isPending}
              >
                <Lightbulb className="mr-1 h-3.5 w-3.5" />
                {suggestMutation.isPending ? "Checking..." : "Suggest from programme"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Early warnings, holdups, decisions awaited. Everything added here
              appears in the report&apos;s Key Issues &amp; Early Warnings
              section. Leave empty to omit the section.
            </p>
            <KeyIssuesEditor
              keyIssues={keyIssues}
              setKeyIssues={setKeyIssues}
              issueDraft={issueDraft}
              setIssueDraft={setIssueDraft}
              idPrefix="report"
            />
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
            <Label>Cover photo (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Pick a site photo to feature on the report cover — tap to
              select, tap again to remove. Leave unselected for the standard
              cover.
            </p>
            <CoverPhotoPicker
              photos={coverPhotos}
              value={coverEvidenceId}
              onChange={setCoverEvidenceId}
            />
          </div>

          <div className="space-y-2">
            <Label>Health &amp; Safety (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Appears as a Health &amp; Safety block on the Executive Summary.
              Leave everything empty to omit it.
            </p>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {(
                [
                  ["accidents", "Accidents"],
                  ["nearMisses", "Near misses"],
                  ["riddor", "RIDDOR"],
                  ["toolboxTalks", "Toolbox talks"],
                  ["inductions", "Inductions"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label
                    htmlFor={`hs-${key}`}
                    className="text-xs font-normal text-muted-foreground"
                  >
                    {label}
                  </Label>
                  <Input
                    id={`hs-${key}`}
                    type="number"
                    min={0}
                    value={hs[key]}
                    onChange={(e) =>
                      setHs((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            <Input
              id="hs-note"
              value={hs.note}
              onChange={(e) =>
                setHs((prev) => ({ ...prev, note: e.target.value }))
              }
              placeholder="Optional note — e.g. Fire drill completed 12 Aug; no incidents"
            />
          </div>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={protectPdf}
                onCheckedChange={(v) => setProtectPdf(v === true)}
              />
              Protect the PDF with a password
            </label>
            {protectPdf && (
              <>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="report-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setPassword(generateMemorablePassword())}
                  >
                    New
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The PDF itself is encrypted with this password. You&apos;ll
                  be able to see it again on the Send screen — share it with
                  your client by text or call, never in the same email as the
                  link.
                </p>
              </>
            )}
          </div>

          {/* Signatures Section */}
          <div className="space-y-3">
            <Label>Sign-off page (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Enter a name, then sign it — &quot;Sign with typed name&quot;
              renders the name as a signature, or draw one by hand. Either
              marks the block &quot;Electronically Approved&quot; and records
              the approval against your account; a name alone just pre-fills
              the block for wet-ink signing after printing. The client&apos;s
              block always prints empty for them to sign.
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
                        applySignature(role, dataUrl);
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
                  ) : typedPreview?.role === role ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signature preview */}
                      <img
                        src={typedPreview.dataUrl}
                        alt="Typed signature preview"
                        className="h-12 rounded border bg-white px-2"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => {
                            applySignature(role, typedPreview.dataUrl);
                            setTypedPreview(null);
                          }}
                        >
                          Save signature
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => setTypedPreview(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const name = sig?.name?.trim();
                            if (!name) return;
                            const dataUrl = typedSignatureDataUrl(name);
                            if (dataUrl) setTypedPreview({ role, dataUrl });
                          }}
                          type="button"
                          disabled={!sig?.name}
                        >
                          <Type className="mr-1 h-3.5 w-3.5" />
                          Sign with typed name
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDrawingRole(role)}
                          type="button"
                          disabled={!sig?.name}
                        >
                          <Pen className="mr-1 h-3.5 w-3.5" />
                          Draw
                        </Button>
                        {savedSignature && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (sig?.name) applySignature(role, savedSignature);
                            }}
                            type="button"
                            disabled={!sig?.name}
                          >
                            Use saved signature
                          </Button>
                        )}
                      </div>
                      {!sig?.name && (
                        <p className="text-xs text-muted-foreground">
                          Enter a name above to enable signing.
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
            variant="outline"
            onClick={handlePreview}
            disabled={previewMutation.isPending || !periodStart || !periodEnd}
          >
            {previewMutation.isPending ? "Building preview..." : "Preview report"}
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

      {/* Full-page review of the real report before committing to the PDF.
          Edits happen back in the form; the preview is the promise. */}
      <Dialog
        open={previewHtmlContent !== null}
        onOpenChange={(next) => {
          if (!next) setPreviewHtmlContent(null);
        }}
      >
        <DialogContent className="grid h-[94vh] w-[96vw] max-w-[96vw] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[96vw]">
          <DialogHeader>
            <DialogTitle>Report preview</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 md:flex-row">
            <iframe
              title="Report preview"
              sandbox=""
              srcDoc={previewHtmlContent ?? ""}
              className="min-h-[45vh] w-full flex-1 rounded-md border bg-white md:min-h-0"
            />
            <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto md:w-96">
              <p className="text-xs text-muted-foreground">
                This is exactly what the PDF will contain. Edit the wording
                here, then <strong>Update preview</strong> to see it in place —
                repeat until it reads right. (Sections, signatures and period
                are edited back in the setup form.)
              </p>
              <div className="space-y-1">
                <Label htmlFor="preview-narrative">Narrative</Label>
                <Textarea
                  id="preview-narrative"
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  rows={10}
                  placeholder="Narrative paragraphs, separated by blank lines — empty uses the standard auto-written summary"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="preview-risks-key-issues">
                  Key risks &amp; observations
                </Label>
                <p className="text-xs text-muted-foreground">
                  The Executive Summary&apos;s risk list — derived from the
                  programme, yours to reword or trim.
                </p>
                <KeyIssuesEditor
                  keyIssues={keyRisksEdit ?? []}
                  setKeyIssues={(action) =>
                    setKeyRisksEdit((prev) =>
                      typeof action === "function" ? action(prev ?? []) : action
                    )
                  }
                  issueDraft={riskDraft}
                  setIssueDraft={setRiskDraft}
                  idPrefix="preview-risks"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="preview-key-issues">Key issues</Label>
                <KeyIssuesEditor
                  keyIssues={keyIssues}
                  setKeyIssues={setKeyIssues}
                  issueDraft={issueDraft}
                  setIssueDraft={setIssueDraft}
                  idPrefix="preview"
                />
              </div>
              <div className="space-y-1">
                <Label>Cover photo</Label>
                <CoverPhotoPicker
                  photos={coverPhotos}
                  value={coverEvidenceId}
                  onChange={setCoverEvidenceId}
                />
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={handlePreview}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending
                  ? "Updating preview..."
                  : "Update preview"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewHtmlContent(null)}
            >
              ← Back to setup
            </Button>
            <Button
              onClick={() => {
                setPreviewHtmlContent(null);
                handleGenerate();
              }}
              disabled={generateMutation.isPending}
            >
              Looks good — generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
