"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Record the formal notification of a defect to the responsible party.
 * The contractual correction deadline is computed from the project's
 * correction period when one is set; otherwise it stays "not confirmed".
 * Oversight roles only (server-enforced).
 */
export function ItemNotifyDialog({ itemId, itemRef, onClose, onDone }: { itemId: string; itemRef: string; onClose: () => void; onDone: () => void }) {
  const [notifiedAt, setNotifiedAt] = useState(todayLocal());
  const [notifiedBy, setNotifiedBy] = useState("");
  const [notifiedTo, setNotifiedTo] = useState("");
  const [notificationRef, setNotificationRef] = useState("");
  const notify = trpc.inspection.notify.useMutation({
    onSuccess: (r) => { toast.success(r.correctionDue ? `Notification recorded · correction due ${r.correctionDue}` : "Notification recorded"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const canSubmit = !notify.isPending && /^\d{4}-\d{2}-\d{2}$/.test(notifiedAt) && notifiedBy.trim().length > 0 && notifiedTo.trim().length > 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record notification · {itemRef}</DialogTitle>
          <DialogDescription>Who told whom, and when. This starts the contractual correction clock when the project has a correction period set; it prints on the record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="notify-date">Date notified</Label>
              <Input id="notify-date" type="date" value={notifiedAt} max={todayLocal()} onChange={(e) => setNotifiedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notify-ref">Reference (optional)</Label>
              <Input id="notify-ref" value={notificationRef} maxLength={120} placeholder="e.g. letter or email ref" onChange={(e) => setNotificationRef(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notify-by">Notified by</Label>
            <Input id="notify-by" value={notifiedBy} maxLength={120} placeholder="Name and role, e.g. J. Smith, Project Manager" onChange={(e) => setNotifiedBy(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notify-to">Notified to</Label>
            <Input id="notify-to" value={notifiedTo} maxLength={120} placeholder="Name and organisation" onChange={(e) => setNotifiedTo(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!canSubmit} onClick={() => notify.mutate({ itemId, notifiedAt, notifiedBy: notifiedBy.trim(), notifiedTo: notifiedTo.trim(), notificationRef: notificationRef.trim() || undefined })}>
              {notify.isPending ? "Saving…" : "Record notification"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
