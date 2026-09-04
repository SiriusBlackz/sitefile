"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { usePWA } from "@/lib/use-pwa";
import {
  loadDiaryDraft,
  saveDiaryDraft,
  clearDiaryDraft,
  listPendingSubmits,
} from "@/lib/diary-draft-store";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { ProvenanceChip } from "@/components/diary/provenance-chip";
import {
  HoldupSheet,
  HOLDUP_CAUSE_LABELS,
} from "@/components/diary/holdup-sheet";
import { diaryFieldLabel } from "@/lib/holdup-causes";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CloudOff,
  Lock,
  OctagonAlert,
  Plus,
  X,
} from "lucide-react";
import type { DiaryProvenance } from "@/server/db/enums";

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface WorkLine {
  taskId?: string | null;
  body: string;
  source: "photo_link" | "manual" | "carried";
  provenance: DiaryProvenance;
  confirmed: boolean;
  evidenceIds?: string[];
  sortOrder: number;
}

interface ResourceState {
  labour: { qty: number; provenance: DiaryProvenance };
  plant: { qty: number; provenance: DiaryProvenance };
  materialsNote: string;
  materialsProvenance: DiaryProvenance;
}

const STEP_TITLES = ["Work done", "Crew & kit", "Hold-ups", "People & safety", "Lock it"];

export default function DiaryRitualPage() {
  return (
    <Suspense
      fallback={<div className="flex-1 bg-background" />}
    >
      <DiaryRitual />
    </Suspense>
  );
}

function DiaryRitual() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("projectId") ?? "";
  const { isOnline: online } = usePWA();
  const utils = trpc.useUtils();

  // Captured once at open — the banner below catches midnight rollover.
  const localDate = useMemo(() => todayLocal(), []);
  const [dateDrift, setDateDrift] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setDateDrift(todayLocal() !== localDate), 60_000);
    return () => clearInterval(t);
  }, [localDate]);

  const { data: day } = trpc.diary.getDay.useQuery(
    { projectId, localDate },
    { enabled: Boolean(projectId) }
  );

  const [step, setStep] = useState(0);
  const [holdupOpen, setHoldupOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Offline lock shows an in-page confirmation — navigating away offline
  // lands on an unloadable page and loses the "it's saved" moment.
  const [offlineLocked, setOfflineLocked] = useState(false);

  // Form state
  const [workLines, setWorkLines] = useState<WorkLine[]>([]);
  const [workNote, setWorkNote] = useState("");
  const [newLine, setNewLine] = useState("");
  const [resources, setResources] = useState<ResourceState>({
    labour: { qty: 0, provenance: "you" },
    plant: { qty: 0, provenance: "you" },
    materialsNote: "",
    materialsProvenance: "you",
  });
  const [carriedApplied, setCarriedApplied] = useState(false);
  const [noneToday, setNoneToday] = useState(false);
  const [visitors, setVisitors] = useState(0);
  const [inspections, setInspections] = useState(0);
  const [incidents, setIncidents] = useState(0);
  const [toolbox, setToolbox] = useState(false);
  const [toolboxTopic, setToolboxTopic] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const enteredAtRef = useRef(new Date());

  const submitMutation = trpc.diary.submit.useMutation();
  const saveDraftMutation = trpc.diary.saveDraft.useMutation();

  // Hydrate once: server draft > local draft > prefill.
  useEffect(() => {
    if (!day || hydrated) return;
    const local = loadDiaryDraft(projectId, localDate);
    if (day.entry && day.entry.status !== "locked") {
      const e = day.entry;
      setWorkLines(
        e.workLines.map((l) => ({
          taskId: l.taskId,
          body: l.body,
          source: l.source as WorkLine["source"],
          provenance: l.provenance as DiaryProvenance,
          confirmed: l.confirmed,
          evidenceIds: (l.evidenceIds as string[] | null) ?? undefined,
          sortOrder: l.sortOrder,
        }))
      );
      setWorkNote(e.workNote ?? "");
      const labour = e.resources.find((r) => r.kind === "labour");
      const plant = e.resources.find((r) => r.kind === "plant");
      const mats = e.resources.find((r) => r.kind === "materials");
      setResources({
        labour: { qty: labour?.qty ?? 0, provenance: (labour?.provenance as DiaryProvenance) ?? "you" },
        plant: { qty: plant?.qty ?? 0, provenance: (plant?.provenance as DiaryProvenance) ?? "you" },
        materialsNote: mats?.note ?? "",
        materialsProvenance: (mats?.provenance as DiaryProvenance) ?? "you",
      });
      setVisitors(e.visitorsCount);
      setInspections(e.inspectionsCount);
      setIncidents(e.incidentsCount);
      setToolbox(e.toolboxTalk);
      setToolboxTopic(e.toolboxTopic ?? "");
      setSafetyNote(e.safetyNote ?? "");
    } else if (!day.entry && local?.payload) {
      try {
        const p = local.payload as ReturnType<typeof buildPayload>;
        setWorkLines(p.workLines as WorkLine[]);
        setWorkNote(p.workNote ?? "");
        const labour = p.resources.find((r) => r.kind === "labour");
        const plant = p.resources.find((r) => r.kind === "plant");
        const mats = p.resources.find((r) => r.kind === "materials");
        setResources({
          labour: { qty: labour?.qty ?? 0, provenance: (labour?.provenance as DiaryProvenance) ?? "you" },
          plant: { qty: plant?.qty ?? 0, provenance: (plant?.provenance as DiaryProvenance) ?? "you" },
          materialsNote: mats?.note ?? "",
          materialsProvenance: (mats?.provenance as DiaryProvenance) ?? "you",
        });
        setVisitors(p.visitorsCount);
        setInspections(p.inspectionsCount);
        setIncidents(p.incidentsCount);
        setToolbox(p.toolboxTalk);
        setToolboxTopic(p.toolboxTopic ?? "");
        setSafetyNote(p.safetyNote ?? "");
        enteredAtRef.current = new Date(local.enteredAt);
      } catch {
        /* fall through to prefill */
      }
    } else if (!day.entry) {
      setWorkLines(
        day.prefill.workLines.map((l) => ({
          ...l,
          taskId: l.taskId,
          evidenceIds: l.evidenceIds,
        }))
      );
    }
    setHydrated(true);
  }, [day, hydrated, projectId, localDate]);

  // Replay any offline submits from previous sessions.
  useEffect(() => {
    if (!online) return;
    for (const pending of listPendingSubmits()) {
      submitMutation.mutate(
        {
          projectId: pending.projectId,
          localDate: pending.localDate,
          enteredAt: new Date(pending.record.enteredAt),
          payload: pending.record.payload as ReturnType<typeof buildPayload>,
        },
        {
          onSuccess: () => {
            clearDiaryDraft(pending.projectId, pending.localDate);
            toast.success(`Diary for ${pending.localDate} synced`);
          },
          onError: (err) => {
            if (/locked/i.test(err.message)) {
              clearDiaryDraft(pending.projectId, pending.localDate);
            }
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when connectivity returns
  }, [online]);

  function buildPayload() {
    return {
      workNote: workNote.trim() || undefined,
      visitorsCount: visitors,
      inspectionsCount: inspections,
      toolboxTalk: toolbox,
      toolboxTopic: toolbox && toolboxTopic.trim() ? toolboxTopic.trim() : undefined,
      incidentsCount: incidents,
      safetyNote: safetyNote.trim() || undefined,
      provenance: {
        labour: resources.labour.provenance,
        plant: resources.plant.provenance,
        materials: resources.materialsProvenance,
        workNote: "you" as const,
      },
      workLines: workLines
        .filter((l) => l.confirmed || l.source === "manual")
        .map((l, i) => ({ ...l, sortOrder: i, body: l.body.slice(0, 500) })),
      resources: [
        { kind: "labour" as const, qty: resources.labour.qty, provenance: resources.labour.provenance },
        { kind: "plant" as const, qty: resources.plant.qty, provenance: resources.plant.provenance },
        {
          kind: "materials" as const,
          qty: 0,
          note: resources.materialsNote.trim() || undefined,
          provenance: resources.materialsProvenance,
        },
      ],
    };
  }

  function persistDraft() {
    const payload = buildPayload();
    saveDiaryDraft(projectId, localDate, {
      payload,
      enteredAt: enteredAtRef.current.toISOString(),
    });
    if (online) {
      saveDraftMutation.mutate({
        projectId,
        localDate,
        enteredAt: enteredAtRef.current,
        payload,
      });
    }
  }

  function advance() {
    persistDraft();
    setStep((s) => Math.min(4, s + 1));
  }

  function lockIt() {
    const payload = buildPayload();
    if (!online) {
      saveDiaryDraft(projectId, localDate, {
        payload,
        enteredAt: enteredAtRef.current.toISOString(),
        pendingSubmit: true,
      });
      setOfflineLocked(true);
      return;
    }
    submitMutation.mutate(
      { projectId, localDate, enteredAt: enteredAtRef.current, payload },
      {
        onSuccess: (res) => {
          clearDiaryDraft(projectId, localDate);
          utils.diary.getDay.invalidate({ projectId, localDate });
          utils.diary.myWeek.invalidate({ projectId, localDate });
          toast.success(
            res.late ? "Locked — flagged as entered late" : "Locked. That's the day on the record."
          );
          router.push(`/projects/${projectId}`);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  if (!projectId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  if (offlineLocked) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-6 text-foreground">
        <div className="mx-auto max-w-sm space-y-4 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/15">
            <Lock className="h-8 w-8 text-green-700 dark:text-green-400" />
          </span>
          <h1 className="text-xl font-extrabold">Locked on your phone</h1>
          <p className="text-sm text-muted-foreground">
            No signal right now — today&apos;s diary is saved and will sync
            itself the moment you&apos;re back in coverage. Your entered time
            is kept; the record shows both stamps.
          </p>
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="mx-auto flex min-h-12 items-center justify-center rounded-xl border px-6 text-sm font-semibold active:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!day || !hydrated) {
    return (
      <div className="flex-1 space-y-3 overflow-y-auto bg-background p-4 text-foreground">
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  // Locked day → read-only summary.
  if (day.entry?.status === "locked") {
    const e = day.entry;
    return (
      <div className="flex-1 overflow-y-auto bg-background p-4 text-foreground">
        <div className="mx-auto max-w-md space-y-4 pb-10">
          <Header onClose={() => router.push(`/projects/${projectId}`)} title="Today's diary" />
          <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4 text-green-700 dark:text-green-400" />
              Locked{e.late ? " · entered late †" : ""}{e.amendedAt ? " · amended ◆" : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Entered{" "}
              {e.enteredAt ? new Date(e.enteredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
              {" · received "}
              {e.receivedAt ? new Date(e.receivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            {e.workLines.map((l) => (
              <p key={l.id} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                <span className="min-w-0 flex-1">{l.body}</span>
                <ProvenanceChip value={l.provenance as DiaryProvenance} />
              </p>
            ))}
            {e.workNote && <p className="text-muted-foreground">“{e.workNote}”</p>}
            <p className="text-xs text-muted-foreground">
              {e.resources.map((r) => `${r.kind}: ${r.kind === "materials" ? (r.note ?? "—") : r.qty}`).join(" · ")}
            </p>
          </div>
          {day.amendments.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Amendments ◆
              </p>
              {day.amendments.map((a) => (
                <div key={a.id} className="rounded-xl border border-dashed p-3 text-xs">
                  <p className="font-semibold">
                    ◆ {diaryFieldLabel(a.field)}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      — {a.by},{" "}
                      {new Date(a.at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  {a.previous != null && (
                    <p className="mt-1 text-muted-foreground line-through">{a.previous}</p>
                  )}
                  {a.next != null && <p className="mt-0.5">{a.next}</p>}
                  {a.note && <p className="mt-0.5 italic text-muted-foreground">“{a.note}”</p>}
                </div>
              ))}
            </div>
          )}
          <AmendForm
            entryId={e.id}
            currentWorkNote={e.workNote ?? ""}
            onAmended={() => utils.diary.getDay.invalidate({ projectId, localDate })}
          />
        </div>
      </div>
    );
  }

  const suggested = workLines.filter((l) => l.source === "photo_link");
  const manual = workLines.filter((l) => l.source === "manual");

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-md space-y-4 p-4 pb-28">
        <Header
          onClose={() => {
            persistDraft();
            router.push(`/projects/${projectId}`);
          }}
          title={STEP_TITLES[step]}
          subtitle={new Date(localDate + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "short",
          })}
        />

        {dateDrift && (
          <div className="rounded-xl border border-amber-400/60 bg-accent p-3 text-xs">
            It&apos;s gone midnight — you&apos;re still filling in{" "}
            <strong>{localDate}</strong>. It will be flagged as entered late,
            with your entry time on the record.
          </div>
        )}

        {/* Step dots */}
        <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 5`}>
          {STEP_TITLES.map((t, i) => (
            <button
              key={t}
              onClick={() => i < step && setStep(i)}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i < step ? "bg-green-500/70" : i === step ? "bg-primary" : "bg-muted"
              )}
              aria-label={t}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Drafted from today&apos;s photos — tick what happened.
            </p>
            {suggested.length === 0 && (
              <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                No photo-linked tasks today. Add a line below — or capture
                photos first and they&apos;ll draft this for you.
              </p>
            )}
            {suggested.map((l, idx) => (
              <button
                key={`${l.taskId}-${idx}`}
                onClick={() =>
                  setWorkLines((prev) =>
                    prev.map((x) => (x === l ? { ...x, confirmed: !x.confirmed } : x))
                  )
                }
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left active:bg-muted",
                  l.confirmed && "border-primary bg-accent"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                    l.confirmed && "border-primary bg-primary text-primary-foreground"
                  )}
                >
                  {l.confirmed && <Check className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">{l.body}</span>
                  <span className="text-xs text-muted-foreground">
                    {l.evidenceIds?.length ?? 0} photo{(l.evidenceIds?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </span>
                <ProvenanceChip value={l.provenance} />
              </button>
            ))}
            {manual.map((l, idx) => (
              <div key={`m-${idx}`} className="flex items-center gap-2 rounded-xl border p-3">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                <span className="min-w-0 flex-1 text-sm">{l.body}</span>
                <ProvenanceChip value="you" />
                <button
                  onClick={() => setWorkLines((prev) => prev.filter((x) => x !== l))}
                  aria-label="Remove line"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={newLine}
                onChange={(e) => setNewLine(e.target.value)}
                placeholder="Add a line of work…"
                enterKeyHint="done"
                className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base"
              />
              <button
                onClick={() => {
                  if (!newLine.trim()) return;
                  setWorkLines((prev) => [
                    ...prev,
                    {
                      body: newLine.trim(),
                      source: "manual",
                      provenance: "you",
                      confirmed: true,
                      sortOrder: prev.length,
                    },
                  ]);
                  setNewLine("");
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border active:bg-muted"
                aria-label="Add line"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={workNote}
              onChange={(e) => setWorkNote(e.target.value)}
              placeholder="Anything worth saying in your own words? Tap the mic on your keyboard and just say it."
              rows={3}
              className="w-full rounded-xl border bg-background p-3 text-base"
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {day.prefill.carriedFromDate && !carriedApplied && (
              <button
                onClick={() => {
                  const labour = day.prefill.resources.find((r) => r.kind === "labour");
                  const plant = day.prefill.resources.find((r) => r.kind === "plant");
                  const mats = day.prefill.resources.find((r) => r.kind === "materials");
                  setResources({
                    labour: { qty: labour?.qty ?? 0, provenance: "carried" },
                    plant: { qty: plant?.qty ?? 0, provenance: "carried" },
                    materialsNote: mats?.note ?? "",
                    materialsProvenance: "carried",
                  });
                  setCarriedApplied(true);
                }}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/50 bg-accent px-3 text-sm font-bold active:brightness-95"
              >
                Same as yesterday
                <span className="font-mono text-[10px] text-(--accent-ink)">1 TAP</span>
              </button>
            )}
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <Stepper
                  label="Operatives on site"
                  value={resources.labour.qty}
                  onChange={(v) =>
                    setResources((r) => ({ ...r, labour: { qty: v, provenance: carriedApplied ? "edited" : "you" } }))
                  }
                  className="flex-1"
                />
                <ProvenanceChip value={resources.labour.provenance} className="ml-2" />
              </div>
              <div className="flex items-center justify-between">
                <Stepper
                  label="Plant on site"
                  value={resources.plant.qty}
                  onChange={(v) =>
                    setResources((r) => ({ ...r, plant: { qty: v, provenance: carriedApplied ? "edited" : "you" } }))
                  }
                  className="flex-1"
                />
                <ProvenanceChip value={resources.plant.provenance} className="ml-2" />
              </div>
            </div>
            <textarea
              value={resources.materialsNote}
              onChange={(e) =>
                setResources((r) => ({
                  ...r,
                  materialsNote: e.target.value,
                  materialsProvenance: "you",
                }))
              }
              placeholder="Materials in / deliveries today (e.g. 8m³ C30, 40 sheets A393)…"
              rows={2}
              className="w-full rounded-xl border bg-background p-3 text-base"
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {day.todaysHoldupDays.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Logged today — already timestamped, they go in as-is.
                </p>
                {day.todaysHoldupDays.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 rounded-xl border border-red-400/40 bg-red-500/5 p-3">
                    <OctagonAlert className="h-4 w-4 shrink-0 text-red-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {HOLDUP_CAUSE_LABELS[h.cause as keyof typeof HOLDUP_CAUSE_LABELS] ?? h.cause} · {h.hoursLost}h
                      </span>
                      {h.note && <span className="block text-xs text-muted-foreground">{h.note}</span>}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(h.loggedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <button
                onClick={() => setNoneToday((n) => !n)}
                className={cn(
                  "flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 text-base font-extrabold active:bg-muted",
                  noneToday
                    ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                    : "border-border"
                )}
              >
                {noneToday && <Check className="h-5 w-5" />}
                No hold-ups today
              </button>
            )}
            {day.openThreads.filter((t) => !t.loggedToday).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Still open from earlier days:</p>
                {day.openThreads
                  .filter((t) => !t.loggedToday)
                  .map((t) => (
                    <ThreadPrompt
                      key={t.id}
                      thread={t}
                      projectId={projectId}
                      localDate={localDate}
                      onActioned={() => {
                        setNoneToday(false);
                        utils.diary.getDay.invalidate({ projectId, localDate });
                      }}
                    />
                  ))}
              </div>
            )}
            <button
              onClick={() => setHoldupOpen(true)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold active:bg-muted"
            >
              <OctagonAlert className="h-4 w-4 text-(--accent-ink)" />
              Log a hold-up
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-xl border p-3">
              <Stepper label="Visitors" value={visitors} onChange={setVisitors} />
              <Stepper label="Inspections" value={inspections} onChange={setInspections} />
              <Stepper label="Incidents / near-misses" value={incidents} onChange={setIncidents} />
            </div>
            {incidents > 0 && (
              <p className="rounded-xl border border-red-400/50 bg-red-500/5 p-2.5 text-xs">
                Incident logged — add what happened below. It flags on the
                PM&apos;s view immediately.
              </p>
            )}
            <div className="flex items-center justify-between rounded-xl border p-3">
              <span className="text-sm font-medium">Toolbox talk held?</span>
              <Switch checked={toolbox} onCheckedChange={(v) => setToolbox(Boolean(v))} />
            </div>
            {toolbox && (
              <input
                value={toolboxTopic}
                onChange={(e) => setToolboxTopic(e.target.value)}
                placeholder="Topic (e.g. lifting ops)"
                className="min-h-11 w-full rounded-xl border bg-background px-3 text-base"
              />
            )}
            <textarea
              value={safetyNote}
              onChange={(e) => setSafetyNote(e.target.value)}
              placeholder="Safety note (optional) — mic works here too."
              rows={2}
              className="w-full rounded-xl border bg-background p-3 text-base"
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-2xl border p-4 text-sm">
              <SummaryRow label="Work lines" value={`${workLines.filter((l) => l.confirmed || l.source === "manual").length} confirmed`} />
              <SummaryRow label="Crew" value={`${resources.labour.qty} operatives · ${resources.plant.qty} plant`} />
              <SummaryRow
                label="Hold-ups"
                value={
                  day.todaysHoldupDays.length > 0
                    ? `${day.todaysHoldupDays.length} logged (${day.todaysHoldupDays.reduce((s, h) => s + h.hoursLost, 0)}h)`
                    : noneToday
                      ? "None — confirmed"
                      : "Not confirmed"
                }
                warn={day.todaysHoldupDays.length === 0 && !noneToday}
              />
              <SummaryRow
                label="People & safety"
                value={`${visitors} visitors · ${inspections} inspections · ${incidents} incidents${toolbox ? " · toolbox ✓" : ""}`}
              />
              {day.weather && (
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-xs text-muted-foreground">
                    Weather attached: {day.weather.totalPrecipMm}mm ·{" "}
                    {day.weather.minTempC}–{day.weather.maxTempC}°C
                  </span>
                  <ProvenanceChip value="auto" />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Locking puts today on the record with your name and time.
              Corrections afterwards are added as flagged amendments — the
              original always stays.
            </p>
            <button
              onClick={lockIt}
              disabled={submitMutation.isPending}
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground active:brightness-95 disabled:opacity-60"
            >
              {online ? <Lock className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
              {submitMutation.isPending
                ? "Locking..."
                : online
                  ? "Lock today's diary"
                  : "Lock — syncs when back in signal"}
            </button>
          </div>
        )}

        {/* Footer nav */}
        {step < 4 && (
          <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 backdrop-blur">
            <div className="mx-auto flex max-w-md gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border active:bg-muted"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={advance}
                className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-primary font-bold text-primary-foreground active:brightness-95"
              >
                {STEP_TITLES[step + 1] ? `Next: ${STEP_TITLES[step + 1]}` : "Next"}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <HoldupSheet
          projectId={projectId}
          localDate={localDate}
          open={holdupOpen}
          onOpenChange={setHoldupOpen}
          onLogged={() => setNoneToday(false)}
        />
      </div>
    </div>
  );
}

/** Append-only amendment on a locked day — original preserved, flagged ◆. */
function AmendForm({
  entryId,
  currentWorkNote,
  onAmended,
}: {
  entryId: string;
  currentWorkNote: string;
  onAmended: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [workNote, setWorkNote] = useState(currentWorkNote);
  const [reason, setReason] = useState("");
  const amend = trpc.diary.amend.useMutation({
    onSuccess: () => {
      toast.success("Amendment added — original preserved, flagged ◆");
      setOpen(false);
      setReason("");
      onAmended();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold active:bg-muted"
      >
        Amend today&apos;s entry ◆
      </button>
    );
  }
  const noteChanged = workNote.trim() !== currentWorkNote.trim();
  const canSubmit = reason.trim().length > 0 && !amend.isPending;
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">
        The original stays on the record; this is added alongside it with
        your name and time.
      </p>
      <textarea
        value={workNote}
        onChange={(e2) => setWorkNote(e2.target.value)}
        rows={2}
        placeholder="Corrected work note (optional)"
        className="w-full rounded-xl border bg-background p-3 text-base"
      />
      <textarea
        value={reason}
        onChange={(e2) => setReason(e2.target.value)}
        rows={2}
        placeholder="What are you correcting, and why?"
        className="w-full rounded-xl border bg-background p-3 text-base"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-xl border px-3 text-sm active:bg-muted"
        >
          Cancel
        </button>
        <button
          disabled={!canSubmit}
          onClick={() =>
            amend.mutate({
              entryId,
              changes: noteChanged
                ? [
                    {
                      field: "workNote",
                      previous: currentWorkNote || null,
                      next: workNote.trim() || null,
                    },
                  ]
                : [{ field: "correction", previous: null, next: reason.trim() }],
              note: reason.trim(),
              apply: noteChanged ? { workNote: workNote.trim() } : undefined,
            })
          }
          className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground active:brightness-95 disabled:opacity-50"
        >
          {amend.isPending ? "Adding..." : "Add amendment ◆"}
        </button>
      </div>
    </div>
  );
}

/** One-tap continuation of a multi-day hold-up thread inside the ritual. */
function ThreadPrompt({
  thread,
  projectId,
  localDate,
  onActioned,
}: {
  thread: {
    id: string;
    cause: string;
    note: string | null;
    taskId: string | null;
    dayCount: number;
    totalHours: number;
  };
  projectId: string;
  localDate: string;
  onActioned: () => void;
}) {
  const [hours, setHours] = useState(1);
  const logHoldup = trpc.diary.logHoldup.useMutation({
    onSuccess: () => {
      toast.success("Added to the thread — still open");
      onActioned();
    },
    onError: (err) => toast.error(err.message),
  });
  const closeHoldup = trpc.diary.closeHoldup.useMutation({
    onSuccess: () => {
      toast.success("Thread resolved");
      onActioned();
    },
    onError: (err) => toast.error(err.message),
  });
  const busy = logHoldup.isPending || closeHoldup.isPending;
  return (
    <div className="space-y-2 rounded-xl border border-amber-400/50 bg-accent/60 p-3">
      <p className="text-sm">
        <span className="font-semibold">
          {HOLDUP_CAUSE_LABELS[thread.cause as keyof typeof HOLDUP_CAUSE_LABELS] ?? thread.cause}
        </span>
        <span className="text-xs text-muted-foreground">
          {" "}
          — still ongoing? Day {thread.dayCount + 1} · {thread.totalHours}h so far
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Stepper value={hours} onChange={setHours} min={0.5} max={24} step={0.5} />
        <button
          disabled={busy}
          onClick={() =>
            logHoldup.mutate({
              projectId,
              localDate,
              cause: thread.cause as Parameters<typeof logHoldup.mutate>[0]["cause"],
              hoursLost: hours,
              taskId: thread.taskId ?? undefined,
              ongoing: true,
              loggedAt: new Date(),
              holdupId: thread.id,
            })
          }
          className="min-h-11 flex-1 rounded-xl bg-primary px-2 text-xs font-bold text-primary-foreground active:brightness-95 disabled:opacity-50"
        >
          Still going · log {hours}h
        </button>
        <button
          disabled={busy}
          onClick={() => closeHoldup.mutate({ holdupId: thread.id, closedOn: localDate })}
          className="min-h-11 rounded-xl border px-3 text-xs font-semibold active:bg-muted disabled:opacity-50"
        >
          Resolved
        </button>
      </div>
    </div>
  );
}

function Header({
  onClose,
  title,
  subtitle,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClose}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border active:bg-muted"
        aria-label="Save and close"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-extrabold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">SITE DIARY</span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold", warn && "text-red-600 dark:text-red-400")}>
        {value}
      </span>
    </div>
  );
}
