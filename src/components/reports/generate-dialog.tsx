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
import { toast } from "sonner";
import { Pen, X } from "lucide-react";
import { SignaturePad } from "./signature-pad";

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

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onGenerated: () => void;
}

export function GenerateDialog({
  open,
  onOpenChange,
  projectId,
  onGenerated,
}: GenerateDialogProps) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [password, setPassword] = useState("");
  const [signatures, setSignatures] = useState<SignatureInput[]>([]);
  const [drawingRole, setDrawingRole] = useState<string | null>(null);

  const generateMutation = trpc.report.generate.useMutation({
    onSuccess: () => {
      toast.success("Report generation started");
      handleClose();
      onGenerated();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleClose() {
    setPeriodStart("");
    setPeriodEnd("");
    setPassword("");
    setSignatures([]);
    setDrawingRole(null);
    onOpenChange(false);
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

    generateMutation.mutate({
      projectId,
      periodStart,
      periodEnd,
      password: password || undefined,
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
    <Dialog open={open} onOpenChange={handleClose}>
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

          <div className="space-y-2">
            <Label htmlFor="report-password">Download password (optional)</Label>
            <Input
              id="report-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for no password"
            />
            <p className="text-xs text-muted-foreground">
              If set, this password will be required to download the report.
              Note: this gates the download URL; it does not encrypt the PDF file itself.
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
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
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
