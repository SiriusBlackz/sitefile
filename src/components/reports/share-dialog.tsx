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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, Circle, Copy, Send } from "lucide-react";
import { formatDateTime } from "@/lib/format";

/**
 * Send & receipt: creates the tokenised client link and shows the
 * delivery timeline — sent, opened, downloaded — refreshed live while
 * the dialog is open. "The client opened it" made visible.
 */
export function ShareDialog({
  open,
  onOpenChange,
  reportId,
  reportNumber,
  hasPassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  reportNumber: number;
  hasPassword: boolean;
}) {
  const [recipient, setRecipient] = useState("");
  const utils = trpc.useUtils();
  const { data: shares = [], isLoading } = trpc.report.shareStatus.useQuery(
    { reportId },
    { enabled: open, refetchInterval: open ? 8000 : false }
  );

  const createMutation = trpc.report.createShare.useMutation({
    onSuccess: async (data) => {
      utils.report.shareStatus.invalidate({ reportId });
      try {
        await navigator.clipboard.writeText(data.url);
        toast.success("Share link created and copied to clipboard");
      } catch {
        toast.success("Share link created");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = trpc.report.revokeShare.useMutation({
    onSuccess: () => {
      utils.report.shareStatus.invalidate({ reportId });
      toast.success("Link withdrawn — it no longer works");
    },
    onError: (err) => toast.error(err.message),
  });

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link text and copy manually");
    }
  }

  const active = shares.filter((s) => !s.revokedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Report #{reportNumber} to your client</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {active.length === 0 && !isLoading && (
            <>
              <p className="text-sm text-muted-foreground">
                Creates a private link to this report for your client — send
                it by email or WhatsApp. You&apos;ll see here when they open
                it and when they download the PDF.
              </p>
              <div className="space-y-1">
                <Label htmlFor="share-recipient">
                  Who is it going to? (optional)
                </Label>
                <Input
                  id="share-recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="e.g. K. Osei — Harlow Estates"
                />
              </div>
              <Button
                onClick={() =>
                  createMutation.mutate({
                    reportId,
                    recipientLabel: recipient.trim() || undefined,
                  })
                }
                disabled={createMutation.isPending}
              >
                <Send className="mr-1.5 h-4 w-4" />
                {createMutation.isPending ? "Creating…" : "Create share link"}
              </Button>
            </>
          )}

          {active.map((share) => (
            <div key={share.id} className="space-y-3 rounded-lg border p-3">
              {share.recipientLabel && (
                <div className="text-sm font-medium">{share.recipientLabel}</div>
              )}
              <div className="flex items-center gap-1.5">
                <Input readOnly value={share.url} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => copy(share.url)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              {hasPassword && (
                <p className="text-xs text-muted-foreground">
                  The PDF is encrypted — share the password separately (a
                  text or call, not the same email as the link).
                </p>
              )}

              <div className="space-y-1.5 text-sm">
                <ReceiptRow
                  done
                  label="Sent"
                  detail={share.createdAt ? formatDateTime(share.createdAt) : ""}
                />
                <ReceiptRow
                  done={!!share.openedAt}
                  label={
                    share.openedAt
                      ? `Opened${share.openCount > 1 ? ` (${share.openCount}×)` : ""}`
                      : "Opened"
                  }
                  detail={
                    share.openedAt
                      ? formatDateTime(share.openedAt)
                      : "not yet — updates live"
                  }
                />
                <ReceiptRow
                  done={!!share.downloadedAt}
                  label="PDF downloaded"
                  detail={
                    share.downloadedAt
                      ? formatDateTime(share.downloadedAt)
                      : "not yet"
                  }
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => revokeMutation.mutate({ shareId: share.id })}
                disabled={revokeMutation.isPending}
              >
                Withdraw this link
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      )}
      <span className={done ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}
