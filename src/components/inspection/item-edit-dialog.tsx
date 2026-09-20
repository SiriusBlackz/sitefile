"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ITEM_TYPE_LABELS } from "@/lib/inspection-location";
import { INSPECTION_ITEM_TYPES, type InspectionItemType } from "@/server/db/enums";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";

const PRIORITIES = ["", "Urgent", "High", "Medium", "Low"] as const;
const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Desk edit of a register item's management fields. The phone records the
 * finding; the desk is where the PM assigns responsibility, priority and
 * dates. Location is not edited here — it is scheme-shaped and belongs to
 * the recorder on the phone. Only fields that changed are sent, so the
 * "updated …" trail line names exactly what moved.
 */
export function ItemEditDialog({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const { data: item, isLoading } = trpc.inspection.get.useQuery({ itemId });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit details{item ? ` · ${item.ref}` : ""}</DialogTitle>
          <DialogDescription>Responsibility, priority and dates for the record. Changes are logged on the item&apos;s trail.</DialogDescription>
        </DialogHeader>
        {isLoading || !item ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : (
          <EditForm item={item} onClose={onClose} onDone={onDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Item = inferRouterOutputs<AppRouter>["inspection"]["get"];

function EditForm({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const { data: members = [] } = trpc.project.memberList.useQuery({ projectId: item.projectId });
  const [f, setF] = useState({
    type: item.type as InspectionItemType,
    title: item.title,
    finding: item.finding,
    suspectedCause: item.suspectedCause ?? "",
    priority: item.priority ?? "",
    category: item.category ?? "",
    responsibleOrg: item.responsibleOrg ?? "",
    responsibleUserId: item.responsibleUserId ?? "",
    repairTarget: item.repairTarget ?? "",
    acceptanceBasis: item.acceptanceBasis ?? "",
    interimAction: item.interimAction ?? "",
    accessNote: item.accessNote ?? "",
    nextAction: item.nextAction ?? "",
    nextActionOwner: item.nextActionOwner ?? "",
    nextActionDue: item.nextActionDue ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const update = trpc.inspection.itemUpdate.useMutation({ onSuccess: () => { toast.success("Details saved"); onDone(); }, onError: (e) => toast.error(e.message) });

  const customPriority = f.priority && !(PRIORITIES as readonly string[]).includes(f.priority);
  const valid = f.title.trim().length > 0 && f.finding.trim().length > 0 && (!f.repairTarget || DATE.test(f.repairTarget)) && (!f.nextActionDue || DATE.test(f.nextActionDue));

  const submit = () => {
    // Send only what changed; nullable text fields go to null when cleared.
    const patch: Record<string, unknown> = { itemId: item.id };
    const txt = (k: keyof typeof f, orig: string | null | undefined) => {
      const v = f[k].trim();
      if (v !== (orig ?? "")) patch[k] = v || null;
    };
    if (f.type !== item.type) patch.type = f.type;
    if (f.title.trim() !== item.title) patch.title = f.title.trim();
    if (f.finding.trim() !== item.finding) patch.finding = f.finding.trim();
    txt("suspectedCause", item.suspectedCause);
    txt("priority", item.priority);
    txt("category", item.category);
    txt("responsibleOrg", item.responsibleOrg);
    txt("acceptanceBasis", item.acceptanceBasis);
    txt("interimAction", item.interimAction);
    txt("accessNote", item.accessNote);
    txt("nextAction", item.nextAction);
    txt("nextActionOwner", item.nextActionOwner);
    if (f.responsibleUserId !== (item.responsibleUserId ?? "")) patch.responsibleUserId = f.responsibleUserId || null;
    if (f.repairTarget !== (item.repairTarget ?? "")) patch.repairTarget = f.repairTarget || null;
    if (f.nextActionDue !== (item.nextActionDue ?? "")) patch.nextActionDue = f.nextActionDue || null;
    if (Object.keys(patch).length === 1) { onClose(); return; }
    update.mutate(patch as Parameters<typeof update.mutate>[0]);
  };

  return (
    <div className="space-y-3">
    <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="ed-type">Type</Label>
          <select id="ed-type" value={f.type} onChange={(e) => set("type", e.target.value as InspectionItemType)} className={selectClass}>
            {INSPECTION_ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t] ?? t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-title">Title</Label>
          <Input id="ed-title" value={f.title} maxLength={160} onChange={(e) => set("title", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ed-finding">Finding</Label>
        <Textarea id="ed-finding" rows={3} value={f.finding} maxLength={4000} onChange={(e) => set("finding", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ed-cause">Suspected cause (not verified)</Label>
        <Input id="ed-cause" value={f.suspectedCause} maxLength={1000} onChange={(e) => set("suspectedCause", e.target.value)} />
      </div>

      <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsibility and priority</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ed-priority">Priority</Label>
          <select id="ed-priority" value={f.priority} onChange={(e) => set("priority", e.target.value)} className={selectClass}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p || "Not set"}</option>)}
            {customPriority && <option value={f.priority}>{f.priority}</option>}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-category">Category</Label>
          <Input id="ed-category" value={f.category} maxLength={80} placeholder="e.g. Drainage, Finishes" onChange={(e) => set("category", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-org">Responsible organisation</Label>
          <Input id="ed-org" value={f.responsibleOrg} maxLength={120} placeholder="Subcontractor or party" onChange={(e) => set("responsibleOrg", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-user">Responsible person (project member)</Label>
          <select id="ed-user" value={f.responsibleUserId} onChange={(e) => set("responsibleUserId", e.target.value)} className={selectClass}>
            <option value="">Not assigned</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.user?.name ?? m.user?.email ?? m.userId}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-repair">Repair target date</Label>
          <Input id="ed-repair" type="date" value={f.repairTarget} onChange={(e) => set("repairTarget", e.target.value)} />
          <p className="text-[11px] text-muted-foreground">The agreed target. The contractual deadline is computed from the notification, not typed here.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-basis">Acceptance basis</Label>
          <Input id="ed-basis" value={f.acceptanceBasis} maxLength={500} placeholder="Spec clause, drawing or standard" onChange={(e) => set("acceptanceBasis", e.target.value)} />
        </div>
      </div>

      <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Site notes</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ed-interim">Interim action</Label>
          <Input id="ed-interim" value={f.interimAction} maxLength={1000} placeholder="Make-safe or temporary measure in place" onChange={(e) => set("interimAction", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-access">Access note</Label>
          <Input id="ed-access" value={f.accessNote} maxLength={500} placeholder="Permit, possession or access needed" onChange={(e) => set("accessNote", e.target.value)} />
        </div>
      </div>

      <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next action</h4>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
        <div className="space-y-1.5">
          <Label htmlFor="ed-next">Next action</Label>
          <Input id="ed-next" value={f.nextAction} maxLength={500} onChange={(e) => set("nextAction", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-next-owner">Owner</Label>
          <Input id="ed-next-owner" value={f.nextActionOwner} maxLength={120} onChange={(e) => set("nextActionOwner", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-next-due">Due</Label>
          <Input id="ed-next-due" type="date" value={f.nextActionDue} onChange={(e) => set("nextActionDue", e.target.value)} />
        </div>
      </div>

    </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" disabled={update.isPending} onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || update.isPending} onClick={submit}>{update.isPending ? "Saving…" : "Save details"}</Button>
      </div>
    </div>
  );
}
