"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { usePWA } from "@/lib/use-pwa";
import { useItemPhotoUpload } from "@/components/inspection/use-item-photo-upload";
import {
  SCHEME_FIELDS,
  ITEM_TYPE_LABELS,
  type LocationFields,
} from "@/lib/inspection-location";
import { ArrowLeft, Camera, CloudOff, MapPin, X } from "lucide-react";
import { readStage, readCachedProject, writeCachedProject } from "@/lib/inspection-local";
import { saveItemDraft } from "@/lib/inspection-offline";
import { useInspectionDrain } from "@/components/inspection/use-inspection-drain";

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function InspectNewPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-background" />}>
      <RecordItem />
    </Suspense>
  );
}

/**
 * Record one register item: location (scheme fields + written line, last
 * values carried), photos (file-input camera, role 'defect'), the finding
 * (native keyboard dictation), type. Item creation needs signal; photos
 * that fail to upload are queued against the item and drained later.
 */
function RecordItem() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("projectId") ?? "";
  const { isOnline } = usePWA();
  const utils = trpc.useUtils();
  const { data: project } = trpc.project.get.useQuery({ id: projectId }, { enabled: !!projectId });
  // Cold offline open: react-query has nothing, so fall back to what the
  // last online visit cached rather than guessing "building" (C27).
  const cached = typeof window !== "undefined" ? readCachedProject(projectId) : null;
  const scheme = project?.locationScheme ?? cached?.locationScheme ?? "building";
  useEffect(() => {
    if (project) writeCachedProject(projectId, { locationScheme: project.locationScheme ?? null, name: project.name });
  }, [project, projectId]);
  const fields = SCHEME_FIELDS[scheme] ?? [];
  const lastKey = `sitefile.inspect.${projectId}.lastLocation`;

  const [loc, setLoc] = useState<LocationFields>({ description: "" });
  const [type, setType] = useState<"defect" | "snag" | "outstanding_work" | "observation">("defect");
  const [title, setTitle] = useState("");
  const [finding, setFinding] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [gpsState, setGpsState] = useState<"pending" | "ok" | "off">("pending");
  const [saving, setSaving] = useState<null | string>(null);
  const [mounted, setMounted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  // Carry the last location forward — the next defect is usually nearby.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lastKey);
      if (raw) {
        const saved = JSON.parse(raw) as LocationFields;
        setLoc({ ...saved, description: "" });
      }
    } catch {}
  }, [lastKey]);

  // Position at record time (iOS strips EXIF GPS from file-input photos).
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsState("ok");
      },
      () => setGpsState("off"),
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const visitEnsure = trpc.inspection.visitEnsure.useMutation();
  const itemCreate = trpc.inspection.itemCreate.useMutation();
  const { upload } = useItemPhotoUpload();
  useInspectionDrain(projectId);

  const canSave = loc.description.trim().length > 0 && finding.trim().length > 0 && !saving;

  const buildPayload = () => ({
    type,
    title: title.trim() || finding.trim().slice(0, 80),
    finding: finding.trim(),
    location: Object.fromEntries(
      Object.entries(loc).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v)
    ) as LocationFields,
    latitude: position?.latitude,
    longitude: position?.longitude,
    accuracyM: position?.accuracy,
    clientAt: new Date().toISOString(),
  });
  const rememberLocation = () => {
    try {
      const { description: _d, ...rest } = loc;
      void _d;
      localStorage.setItem(lastKey, JSON.stringify(rest));
    } catch {}
  };
  const resetForm = (andAnother: boolean) => {
    if (andAnother) {
      setTitle("");
      setFinding("");
      setFiles([]);
      setLoc((l) => ({ ...l, description: "" }));
      setSaving(null);
      window.scrollTo({ top: 0 });
    } else {
      router.push(`/inspect?projectId=${projectId}`);
    }
  };

  // No signal: the whole item (payload + photo blobs) goes to the separate
  // inspection drafts database and is drained item-first when signal returns.
  const saveOffline = async (andAnother: boolean) => {
    if (!canSave) return;
    setSaving("Saving offline…");
    try {
      await saveItemDraft({
        id: crypto.randomUUID(),
        projectId,
        visitDate: todayLocal(),
        stage: readStage(projectId),
        payload: buildPayload(),
        photos: files.map((f) => ({
          blob: f,
          filename: f.name || `item-${Date.now()}.jpg`,
          mimeType: f.type || "image/jpeg",
          role: "defect",
          capturedAt: new Date(f.lastModified || Date.now()).toISOString(),
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
        })),
        createdAt: Date.now(),
        status: "pending",
      });
      rememberLocation();
      window.dispatchEvent(new CustomEvent("inspection-drafts-changed"));
      toast.success("Saved on this phone · ref pending until you have signal");
      resetForm(andAnother);
    } catch (err) {
      setSaving(null);
      toast.error(err instanceof Error ? err.message : "Could not save offline");
    }
  };

  const save = async (andAnother: boolean) => {
    if (!canSave) return;
    if (!isOnline) return saveOffline(andAnother);
    setSaving("Saving item…");
    try {
      const visit = await visitEnsure.mutateAsync({
        projectId,
        visitDate: todayLocal(),
        stage: readStage(projectId),
      });
      const id = crypto.randomUUID();
      const item = await itemCreate.mutateAsync({ projectId, id, visitId: visit.id, ...buildPayload() });
      rememberLocation();
      let queued = 0;
      for (let i = 0; i < files.length; i++) {
        setSaving(`Uploading photo ${i + 1} of ${files.length}…`);
        const r = await upload({
          projectId,
          itemId: item.id,
          file: files[i],
          role: "defect",
          position: position ? { latitude: position.latitude, longitude: position.longitude } : null,
        });
        if (r.status === "queued") queued++;
      }
      utils.inspection.list.invalidate({ projectId });
      utils.inspection.summary.invalidate({ projectId });
      toast.success(
        queued > 0
          ? `${item.ref} saved · ${queued} photo${queued === 1 ? "" : "s"} queued for upload`
          : `${item.ref} saved`
      );
      resetForm(andAnother);
    } catch (err) {
      // Signal dropped mid-save: keep the work rather than losing it.
      if (typeof navigator !== "undefined" && !navigator.onLine) return saveOffline(andAnother);
      setSaving(null);
      toast.error(err instanceof Error ? err.message : "Could not save the item");
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-2 border-b px-3 py-3">
        <Link href={`/inspect?projectId=${projectId}`} aria-label="Back" className="rounded-full p-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold">Record item</h1>
          <p className="truncate text-xs text-muted-foreground">{project?.name ?? cached?.name}</p>
        </div>
        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {gpsState === "ok" && position ? `±${Math.round(position.accuracy)} m` : gpsState === "off" ? "GPS off" : "GPS…"}
        </span>
      </header>

      {mounted && !isOnline && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <CloudOff className="h-4 w-4 shrink-0" />
          No signal — this item saves on the phone and gets its reference once you open the app with signal.
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4 pb-28">
        <section className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Location</h2>
          <div className="grid grid-cols-2 gap-2">
            {fields.map((f) =>
              f.options ? (
                <select
                  key={f.key}
                  value={(loc[f.key] as string) ?? ""}
                  onChange={(e) => setLoc({ ...loc, [f.key]: e.target.value })}
                  className="h-11 rounded-lg border bg-background px-3 text-sm"
                  aria-label={f.label}
                >
                  <option value="">{f.label}</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  key={f.key}
                  value={(loc[f.key] as string) ?? ""}
                  onChange={(e) => setLoc({ ...loc, [f.key]: e.target.value })}
                  placeholder={f.label}
                  className="h-11 rounded-lg border bg-background px-3 text-sm"
                  aria-label={f.label}
                />
              )
            )}
          </div>
          <input
            value={loc.description}
            onChange={(e) => setLoc({ ...loc, description: e.target.value })}
            placeholder="Where exactly — written so a stranger could find it"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
            aria-label="Location description"
            required
          />
        </section>

        <section className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Photos</h2>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) setFiles((f) => [...f, ...picked]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            {previews.map((p, i) => (
              <div key={p.url} className="relative h-20 w-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                  className="absolute -right-1 -top-1 rounded-full bg-foreground p-0.5 text-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs"
            >
              <Camera className="h-5 w-5" />
              {files.length ? "Add" : "Take"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">One wide view for location, one close-up for detail.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Finding</h2>
          <textarea
            value={finding}
            onChange={(e) => setFinding(e.target.value)}
            rows={4}
            placeholder="What you can see — extent, condition. Use the mic on your keyboard to dictate."
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            aria-label="Finding"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title (optional — first words of the finding otherwise)"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
            aria-label="Title"
          />
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ITEM_TYPE_LABELS) as (typeof type)[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  type === t ? "bg-foreground text-background" : ""
                )}
              >
                {ITEM_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 grid grid-cols-2 gap-2 border-t bg-background p-3">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => save(true)}
          className="h-12 rounded-xl border text-sm font-semibold disabled:opacity-50"
        >
          Save & next
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => save(false)}
          className="h-12 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ?? "Save item"}
        </button>
      </div>
    </div>
  );
}
