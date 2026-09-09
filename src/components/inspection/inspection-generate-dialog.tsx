"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/reports/signature-pad";
import { INSPECTION_SECTION_KEYS, INSPECTION_SECTION_LABELS, INSPECTION_RECIPE } from "@/lib/inspection-report-sections";
import { STAGE_LABELS } from "@/lib/inspection-location";
import { INSPECTION_VISIT_STAGES, INSPECTION_REPORT_KINDS } from "@/server/db/enums";
import { RefreshCw } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  inspection_record: "Inspection record (this visit)",
  register_status: "Register status (all items)",
  closeout: "Closeout",
};
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
 * Generate a Defects Inspection and Closeout Report: pick the visit,
 * stage and kind, complete the scope facts, preview, then generate with
 * an optional password and electronic approvals. The client block on the
 * PDF is always left for wet ink.
 */
export function InspectionGenerateDialog({ open, onOpenChange, projectId, onGenerated }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string; onGenerated: () => void }) {
  const utils = trpc.useUtils();
  const { data: visits = [] } = trpc.inspection.visitList.useQuery({ projectId }, { enabled: open });
  const { data: me } = trpc.project.currentUser.useQuery(undefined, { enabled: open });
  const { data: reissuable = [] } = trpc.inspection.reissuable.useQuery({ projectId }, { enabled: open });
  const [supersedesReportId, setSupersedesReportId] = useState<string>("");
  const [visitId, setVisitId] = useState<string>("");
  const [stage, setStage] = useState<(typeof INSPECTION_VISIT_STAGES)[number]>("end_of_defects_period");
  const [kind, setKind] = useState<(typeof INSPECTION_REPORT_KINDS)[number]>("inspection_record");
  const [scopeNote, setScopeNote] = useState("");
  const [methodLine, setMethodLine] = useState("");
  const [weather, setWeather] = useState("");
  const [urgentConcerns, setUrgentConcerns] = useState("");
  const [distributionText, setDistributionText] = useState("");
  const [attendeesText, setAttendeesText] = useState("");
  const [notInspectedText, setNotInspectedText] = useState("");
  const [sections, setSections] = useState<Record<string, boolean>>({ ...INSPECTION_RECIPE });
  const [protect, setProtect] = useState(true);
  const [password, setPassword] = useState(() => memorablePassword());
  const [sigs, setSigs] = useState<Record<string, Sig | undefined>>({});
  const [drawing, setDrawing] = useState<"contractor" | "project_manager" | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const visit = useMemo(() => visits.find((v) => v.id === visitId), [visits, visitId]);
  useEffect(() => {
    if (!visitId && visits[0]) setVisitId(visits[0].id);
  }, [visits, visitId]);
  useEffect(() => {
    if (!visit) return;
    setStage(visit.stage as typeof stage);
    setScopeNote(visit.scopeNote ?? "");
    setMethodLine(visit.methodLine ?? "");
    setWeather(visit.weather ?? "");
    setUrgentConcerns(visit.urgentConcerns ?? "");
    const at = (visit.attendees as { name: string; org?: string; role?: string }[]) ?? [];
    setAttendeesText(
      (at as { name: string; org?: string; role?: string; authority?: string }[])
        .map((a) => [a.name, a.org, a.role, a.authority].filter(Boolean).join(", "))
        .join("\n")
    );
    const ni = (visit.notInspected as { area: string; reason?: string }[]) ?? [];
    setNotInspectedText(ni.map((n) => [n.area, n.reason].filter(Boolean).join(" — ")).join("\n"));
  }, [visit]);

  const parseAttendees = () =>
    attendeesText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, org, role, authority] = l.split(",").map((x) => x.trim());
      return { name, org: org || undefined, role: role || undefined, authority: authority || undefined };
    });
  const parseNotInspected = () =>
    notInspectedText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [area, reason] = l.split("—").map((x) => x.trim());
      return { area, reason: reason || undefined };
    });
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
    attendees: parseAttendees(),
    notInspected: parseNotInspected(),
    signatures: (Object.values(sigs).filter(Boolean) as Sig[]).map((s) => ({ ...s, date: s.date ?? new Date().toLocaleDateString("en-GB") })),
  });

  const preview = trpc.inspection.previewHtml.useMutation({
    onSuccess: (r) => setPreviewHtml(r.html),
    onError: (e) => toast.error(e.message),
  });
  const generate = trpc.inspection.generateReport.useMutation({
    onSuccess: (r) => {
      toast.success(`Report #${r.reportNumber}${r.revision > 1 ? ` revision ${r.revision}` : ""} is generating`);
      utils.report.list.invalidate({ projectId });
      onGenerated();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const setSig = (role: Sig["role"], patch: Partial<Sig>) =>
    setSigs((s) => ({ ...s, [role]: { role, name: s[role]?.name ?? "", ...s[role], ...patch } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate inspection report</DialogTitle>
          <DialogDescription>
            Defects Inspection and Closeout Report. Counts are at the issue date; only Verified closed counts as closed. The client block stays blank for wet ink.
          </DialogDescription>
        </DialogHeader>

        {previewHtml ? (
          <div className="space-y-3">
            <iframe title="Report preview" srcDoc={previewHtml} className="h-[60vh] w-full rounded border bg-white" />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPreviewHtml(null)}>Back to edit</Button>
              <Button disabled={generate.isPending} onClick={() => generate.mutate({ ...facts(), password: protect ? password : undefined, supersedesReportId: supersedesReportId || undefined })}>
                {generate.isPending ? "Queuing…" : "Generate PDF"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Visit</Label>
                <select value={visitId} onChange={(e) => setVisitId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  {visits.length === 0 && <option value="">No visits yet — record an item first</option>}
                  {visits.map((v) => (
                    <option key={v.id} value={v.id}>{v.visitDate} · {STAGE_LABELS[v.stage]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  {INSPECTION_VISIT_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Report kind</Label>
                <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  {INSPECTION_REPORT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">
                  {kind === "inspection_record" ? "This visit only — items first recorded or acted on at it." : kind === "closeout" ? "Whole register; each item shows as-found beside verified." : "Whole register at the issue date."}
                </p>
              </div>
            </div>

            {reissuable.length > 0 && (
              <div className="space-y-1.5">
                <Label>Re-issue</Label>
                <select value={supersedesReportId} onChange={(e) => setSupersedesReportId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">New report number</option>
                  {reissuable.map((r) => (
                    <option key={r.id} value={r.id}>
                      Supersede #{r.reportNumber} rev {r.revision} · {KIND_LABELS[r.kind] ?? r.kind}{r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString("en-GB")}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">A re-issue keeps the number, adds a revision and prints which issue it supersedes. The earlier PDF stays on file.</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ig-scope">Areas inspected</Label>
                <textarea id="ig-scope" rows={3} value={scopeNote} onChange={(e) => setScopeNote(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="e.g. Access road ch 0+000 to 0+520 both sides; car park; drainage chambers MH-01 to MH-09" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-method">Method and conditions</Label>
                <textarea id="ig-method" rows={3} value={methodLine} onChange={(e) => setMethodLine(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Visual walkover from ground level; dry, overcast" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-weather">Weather and conditions</Label>
                <Input id="ig-weather" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="e.g. Dry, overcast, 14°C" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-att">Attendees (one per line: name, organisation, role, decision authority)</Label>
                <textarea id="ig-att" rows={3} value={attendeesText} onChange={(e) => setAttendeesText(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={`${me?.name ?? "Name"}, Contractor, Inspector\nJ Smith, Client, Supervisor, NEC4 Supervisor`} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-ni">Not inspected (one per line: area — reason)</Label>
                <textarea id="ig-ni" rows={3} value={notInspectedText} onChange={(e) => setNotInspectedText(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Attenuation tank interior — confined space, no entry" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-dist">Distribution (one recipient per line)</Label>
                <textarea id="ig-dist" rows={3} value={distributionText} onChange={(e) => setDistributionText(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={"A. Client, Demo Client Ltd\nSite file"} />
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="outline" disabled={!visitId || preview.isPending} onClick={() => preview.mutate(facts())}>{preview.isPending ? "Rendering…" : "Preview"}</Button>
              <Button disabled={!visitId || generate.isPending} onClick={() => generate.mutate({ ...facts(), password: protect ? password : undefined, supersedesReportId: supersedesReportId || undefined })}>
                {generate.isPending ? "Queuing…" : "Generate PDF"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
