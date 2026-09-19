"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/reports/signature-pad";
import { A4Preview } from "@/components/reports/a4-preview";
import { INSPECTION_SECTION_KEYS, INSPECTION_SECTION_LABELS, INSPECTION_RECIPE } from "@/lib/inspection-report-sections";
import { STAGE_LABELS } from "@/lib/inspection-location";
import { INSPECTION_VISIT_STAGES, INSPECTION_REPORT_KINDS } from "@/server/db/enums";
import { effectiveFacts, type InspectionDraftPayload } from "@/lib/inspection-readiness";
import {
  INSPECTION_KIND_LABELS,
  attendeesToText,
  notInspectedToText,
  parseAttendees,
  parseNotInspected,
} from "./inspection-report-builder";
import { RefreshCw } from "lucide-react";

const PW_WORDS = ["kerb", "gully", "rebar", "gantry", "trench", "piling", "asphalt", "beam", "purlin", "soffit", "chainage", "culvert", "duct", "membrane"];
function memorablePassword(): string {
  const pick = () => PW_WORDS[Math.floor(Math.random() * PW_WORDS.length)];
  const a = pick();
  let b = pick();
  while (b === a) b = pick();
  return `${a}-${b}-${String(Math.floor(Math.random() * 90) + 10)}`;
}
type Sig = { role: "contractor" | "project_manager"; name: string; title?: string; date?: string; imageDataUrl?: string };

/**
 * Review & issue for the Defects Inspection and Closeout Report. Seeded
 * from the standing draft (built at the desk) or, failing that, the
 * visit's stored facts. Full-width preview shows the exact number and
 * revision that will be issued; edits made here persist back to the
 * draft so closing the dialog never loses preparation. The client block
 * on the PDF is always left for wet ink.
 */
export function InspectionGenerateDialog({
  open,
  onOpenChange,
  projectId,
  onGenerated,
  draft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  onGenerated: () => void;
  draft?: InspectionDraftPayload | null;
}) {
  const utils = trpc.useUtils();
  const { data: visits = [] } = trpc.inspection.visitList.useQuery({ projectId }, { enabled: open });
  const { data: me } = trpc.project.currentUser.useQuery(undefined, { enabled: open });
  const { data: reissuable = [] } = trpc.inspection.reissuable.useQuery({ projectId }, { enabled: open });
  const d = draft ?? {};

  const [supersedesReportId, setSupersedesReportId] = useState<string>(d.supersedesReportId ?? "");
  const [visitId, setVisitId] = useState<string>(d.visitId ?? "");
  const [stage, setStage] = useState<(typeof INSPECTION_VISIT_STAGES)[number]>(d.stage ?? "end_of_defects_period");
  const [kind, setKind] = useState<(typeof INSPECTION_REPORT_KINDS)[number]>(d.kind ?? "inspection_record");
  const [scopeNote, setScopeNote] = useState(d.scopeNote ?? "");
  const [methodLine, setMethodLine] = useState(d.methodLine ?? "");
  const [weather, setWeather] = useState(d.weather ?? "");
  const [urgentConcerns, setUrgentConcerns] = useState(d.urgentConcerns ?? "");
  const [distributionText, setDistributionText] = useState((d.distribution ?? []).join("\n"));
  const [attendeesText, setAttendeesText] = useState(attendeesToText(d.attendees));
  const [notInspectedText, setNotInspectedText] = useState(notInspectedToText(d.notInspected));
  const [sections, setSections] = useState<Record<string, boolean>>({ ...INSPECTION_RECIPE, ...(d.sections ?? {}) });
  const [protect, setProtect] = useState(true);
  const [password, setPassword] = useState(() => memorablePassword());
  const [sigs, setSigs] = useState<Record<string, Sig | undefined>>(
    d.signature?.name ? { contractor: { role: "contractor", name: d.signature.name, title: d.signature.title } } : {}
  );
  const [drawing, setDrawing] = useState<"contractor" | "project_manager" | null>(null);
  const [preview, setPreview] = useState<{ html: string; reportNumber: number; revision: number } | null>(null);

  const visit = useMemo(() => visits.find((v) => v.id === visitId), [visits, visitId]);
  useEffect(() => {
    if (!visitId && visits[0]) setVisitId(visits[0].id);
  }, [visits, visitId]);
  // Seed every field, per visit, from the same source of truth the builder
  // shows: each draft key wins where the draft applies to this visit, the
  // visit's stored value fills the rest. Runs once per visit change.
  useEffect(() => {
    if (!visit) return;
    const f = effectiveFacts({ visit, draft: d });
    const draftApplies = !d.visitId || d.visitId === visit.id;
    setStage(((draftApplies && d.stage) || visit.stage) as typeof stage);
    setScopeNote(f.scopeNote);
    setMethodLine(f.methodLine);
    setWeather(f.weather);
    setUrgentConcerns(f.urgentConcerns);
    setAttendeesText(attendeesToText(f.attendees));
    setNotInspectedText(notInspectedToText(f.notInspected));
    setDistributionText(f.distribution.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per visit change
  }, [visit]);

  const facts = () => ({
    projectId,
    visitId,
    stage,
    kind,
    sections: sections as Partial<Record<(typeof INSPECTION_SECTION_KEYS)[number], boolean>>,
    scopeNote: scopeNote || undefined,
    methodLine: methodLine || undefined,
    weather: weather || undefined,
    urgentConcerns: urgentConcerns || undefined,
    distribution: distributionText.split("\n").map((l) => l.trim()).filter(Boolean),
    attendees: parseAttendees(attendeesText),
    notInspected: parseNotInspected(notInspectedText),
    signatures: (Object.values(sigs).filter(Boolean) as Sig[]).map((s) => ({ ...s, date: s.date ?? new Date().toLocaleDateString("en-GB") })),
  });
  const draftPatch = (): Partial<InspectionDraftPayload> => ({
    visitId,
    stage,
    kind,
    supersedesReportId: supersedesReportId || null,
    scopeNote,
    methodLine,
    weather,
    urgentConcerns,
    distribution: distributionText.split("\n").map((l) => l.trim()).filter(Boolean),
    attendees: parseAttendees(attendeesText),
    notInspected: parseNotInspected(notInspectedText),
    sections,
    ...(sigs.contractor?.name ? { signature: { name: sigs.contractor.name, title: sigs.contractor.title } } : {}),
  });

  const saveDraft = trpc.inspection.draftSave.useMutation({
    onSuccess: () => utils.inspection.draftGet.invalidate({ projectId }),
    onError: (e) => toast.error(`Draft not saved: ${e.message}`),
  });
  const persist = () => { if (visitId) saveDraft.mutate({ projectId, patch: draftPatch() as Record<string, unknown> }); };
  const close = (o: boolean) => { if (!o) persist(); onOpenChange(o); };

  const previewMutation = trpc.inspection.previewHtml.useMutation({
    onSuccess: (r) => setPreview({ html: r.html, reportNumber: r.reportNumber, revision: r.revision }),
    onError: (e) => toast.error(e.message),
  });
  const runPreview = () => { persist(); previewMutation.mutate({ ...facts(), supersedesReportId: supersedesReportId || undefined }); };
  const generate = trpc.inspection.generateReport.useMutation({
    onSuccess: (r) => {
      toast.success(`Report #${r.reportNumber}${r.revision > 1 ? ` revision ${r.revision}` : ""} is generating`);
      utils.report.list.invalidate({ projectId });
      utils.inspection.draftGet.invalidate({ projectId });
      onGenerated();
      setPreview(null);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const runGenerate = () => generate.mutate({ ...facts(), password: protect ? password : undefined, supersedesReportId: supersedesReportId || undefined });

  const setSig = (role: Sig["role"], patch: Partial<Sig>) =>
    setSigs((s) => ({ ...s, [role]: { role, name: s[role]?.name ?? "", ...s[role], ...patch } }));
  const selectCls = "h-9 w-full rounded-md border bg-background px-3 text-sm";
  const ta = "w-full rounded-md border bg-background px-3 py-2 text-sm";

  return (
    <>
      <Dialog open={open && !preview} onOpenChange={close}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review &amp; issue — inspection report</DialogTitle>
            <DialogDescription>
              Defects Inspection and Closeout Report. Counts are at the issue date; only Verified closed counts as closed. The client block stays blank for wet ink.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Visit</Label>
                <select value={visitId} onChange={(e) => setVisitId(e.target.value)} className={selectCls}>
                  {visits.length === 0 && <option value="">No visits yet — record an item first</option>}
                  {visits.map((v) => (
                    <option key={v.id} value={v.id}>{v.visitDate} · {STAGE_LABELS[v.stage]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} className={selectCls}>
                  {INSPECTION_VISIT_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Report kind</Label>
                <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={selectCls}>
                  {INSPECTION_REPORT_KINDS.map((k) => <option key={k} value={k}>{INSPECTION_KIND_LABELS[k]}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">
                  {kind === "inspection_record" ? "This visit only — items first recorded or acted on at it." : kind === "closeout" ? "Whole register; each item shows as-found beside verified." : "Whole register at the issue date."}
                </p>
              </div>
            </div>

            {reissuable.length > 0 && (
              <div className="space-y-1.5">
                <Label>Re-issue</Label>
                <select value={supersedesReportId} onChange={(e) => setSupersedesReportId(e.target.value)} className={selectCls}>
                  <option value="">New report number</option>
                  {reissuable.map((r) => (
                    <option key={r.id} value={r.id}>
                      Supersede #{r.reportNumber} rev {r.revision} · {INSPECTION_KIND_LABELS[r.kind] ?? r.kind}{r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString("en-GB")}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">A re-issue keeps the number, adds a revision and prints which issue it supersedes. The earlier PDF stays on file.</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ig-scope">Areas inspected</Label>
                <textarea id="ig-scope" rows={3} value={scopeNote} onChange={(e) => setScopeNote(e.target.value)} className={ta} placeholder="e.g. Access road ch 0+000 to 0+520 both sides; car park; drainage chambers MH-01 to MH-09" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-method">Method and conditions</Label>
                <textarea id="ig-method" rows={3} value={methodLine} onChange={(e) => setMethodLine(e.target.value)} className={ta} placeholder="Visual walkover from ground level; no opening up" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-weather">Weather and conditions</Label>
                <Input id="ig-weather" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="e.g. Dry, overcast, 14°C" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-att">Attendees (one per line: name, organisation, role, decision authority)</Label>
                <textarea id="ig-att" rows={3} value={attendeesText} onChange={(e) => setAttendeesText(e.target.value)} className={ta} placeholder={`${me?.name ?? "Name"}, Contractor, Inspector\nJ Smith, Client, Supervisor, NEC4 Supervisor`} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-ni">Not inspected (one per line: area — reason)</Label>
                <textarea id="ig-ni" rows={3} value={notInspectedText} onChange={(e) => setNotInspectedText(e.target.value)} className={ta} placeholder="Attenuation tank interior — confined space, no entry" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-dist">Distribution (one recipient per line)</Label>
                <textarea id="ig-dist" rows={3} value={distributionText} onChange={(e) => setDistributionText(e.target.value)} className={ta} placeholder={"A. Client, Demo Client Ltd\nSite file"} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ig-urgent">Urgent concerns (leave blank for none observed within scope)</Label>
                <Input id="ig-urgent" value={urgentConcerns} onChange={(e) => setUrgentConcerns(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sections</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INSPECTION_SECTION_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={sections[k]} onCheckedChange={(v) => setSections((s) => ({ ...s, [k]: Boolean(v) }))} />
                    {INSPECTION_SECTION_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={protect} onCheckedChange={(v) => setProtect(Boolean(v))} /> Password-protect the PDF
              </label>
              {protect && (
                <div className="flex items-center gap-2">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-xs font-mono" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPassword(memorablePassword())}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <Label>Electronic approvals (optional)</Label>
              {(["contractor", "project_manager"] as const).map((role) => (
                <div key={role} className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{role === "contractor" ? "Inspector / contractor" : "Verifier"}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Name" value={sigs[role]?.name ?? ""} onChange={(e) => setSig(role, { name: e.target.value })} />
                    <Input placeholder="Title (optional)" value={sigs[role]?.title ?? ""} onChange={(e) => setSig(role, { title: e.target.value })} />
                  </div>
                  {drawing === role ? (
                    <SignaturePad onSave={(url) => { setSig(role, { imageDataUrl: url }); setDrawing(null); }} onCancel={() => setDrawing(null)} />
                  ) : sigs[role]?.imageDataUrl ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signature preview */}
                      <img src={sigs[role]!.imageDataUrl} alt="Signature" className="h-10 rounded border bg-white px-2" />
                      <Button variant="ghost" size="sm" type="button" onClick={() => setSig(role, { imageDataUrl: undefined })}>Remove</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" type="button" disabled={!sigs[role]?.name} onClick={() => setDrawing(role)}>Draw signature</Button>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>Save &amp; close</Button>
              <Button disabled={!visitId || previewMutation.isPending} onClick={runPreview}>
                {previewMutation.isPending ? "Rendering…" : "Preview →"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-page review of the real report — the exact number and
          revision the issue will carry — with the facts editable beside it. */}
      <Dialog open={open && preview !== null} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="grid h-[94vh] w-[96vw] max-w-[96vw] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[96vw]">
          <DialogHeader>
            <DialogTitle>
              Preview — Report № {preview?.reportNumber}{(preview?.revision ?? 1) > 1 ? ` revision ${preview?.revision}` : ""}
              {supersedesReportId ? " (re-issue)" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 md:flex-row">
            <div className="flex min-h-[45vh] min-w-0 flex-1 flex-col md:min-h-0">
              {preview && <A4Preview html={preview.html} minHeight="45vh" />}
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto md:w-96">
              <p className="text-xs text-muted-foreground">
                This is exactly what the PDF will contain. Edit the wording here, then <strong>Update preview</strong> to see it in place. Sections, password and signatures are back in the setup step.
              </p>
              <div className="space-y-1">
                <Label htmlFor="pv-scope">Areas inspected</Label>
                <Textarea id="pv-scope" rows={3} value={scopeNote} onChange={(e) => setScopeNote(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pv-method">Method and conditions</Label>
                <Textarea id="pv-method" rows={2} value={methodLine} onChange={(e) => setMethodLine(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pv-weather">Weather</Label>
                <Input id="pv-weather" value={weather} onChange={(e) => setWeather(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pv-att">Attendees</Label>
                <Textarea id="pv-att" rows={3} value={attendeesText} onChange={(e) => setAttendeesText(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pv-ni">Not inspected</Label>
                <Textarea id="pv-ni" rows={3} value={notInspectedText} onChange={(e) => setNotInspectedText(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pv-urgent">Urgent concerns</Label>
                <Input id="pv-urgent" value={urgentConcerns} onChange={(e) => setUrgentConcerns(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pv-dist">Distribution</Label>
                <Textarea id="pv-dist" rows={2} value={distributionText} onChange={(e) => setDistributionText(e.target.value)} />
              </div>
              <Button variant="secondary" type="button" disabled={previewMutation.isPending} onClick={runPreview}>
                {previewMutation.isPending ? "Updating preview…" : "Update preview"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>← Back to setup</Button>
            <Button disabled={generate.isPending} onClick={runGenerate}>
              {generate.isPending ? "Queuing…" : `Looks good — issue Report № ${preview?.reportNumber ?? ""}${(preview?.revision ?? 1) > 1 ? ` rev ${preview?.revision}` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
