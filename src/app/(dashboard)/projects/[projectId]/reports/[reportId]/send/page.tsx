"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Check,
  Circle,
  Copy,
  Eye,
  Lock,
  Mail,
  MessageCircle,
  Send,
} from "lucide-react";

/**
 * Send, receipt — and the period rolls over. The Graft's closing
 * ceremony as a real page: seal state, the password card (revealed on
 * demand, shared out-of-band), the tracked link, delivery by the PM's
 * own email/WhatsApp, the receipt timeline, and "Close the period".
 */
export default function SendPage() {
  const { projectId, reportId } = useParams<{
    projectId: string;
    reportId: string;
  }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: report } = trpc.report.get.useQuery({ id: reportId });
  const { data: project } = trpc.project.get.useQuery({ id: projectId });
  const { data: shares = [] } = trpc.report.shareStatus.useQuery(
    { reportId },
    { refetchInterval: 8000 }
  );
  const { data: gaps } = trpc.project.gapList.useQuery({ id: projectId });

  const [recipient, setRecipient] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  const createShare = trpc.report.createShare.useMutation({
    onSuccess: () => utils.report.shareStatus.invalidate({ reportId }),
    onError: (err) => toast.error(err.message),
  });
  const revokeShare = trpc.report.revokeShare.useMutation({
    onSuccess: () => {
      utils.report.shareStatus.invalidate({ reportId });
      toast.success("Link withdrawn — it no longer works");
    },
    onError: (err) => toast.error(err.message),
  });
  const reveal = trpc.report.revealPassword.useMutation({
    onSuccess: (d) => setPassword(d.password),
    onError: (err) => toast.error(err.message),
  });
  const closePeriod = trpc.project.closePeriod.useMutation({
    onSuccess: () => {
      utils.project.gapList.invalidate({ id: projectId });
      utils.report.getDraft.invalidate({ projectId });
      toast.success("Period closed — the next report is open");
      router.push(`/projects/${projectId}/tasks`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (!report) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted" />;
  }

  const active = shares.filter((s) => !s.revokedAt);
  const share = active[0] ?? null;
  const sealed = report.status === "completed";
  const opened = share?.openedAt != null;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  async function ensureShare(): Promise<string | null> {
    if (share) return share.url;
    const res = await createShare
      .mutateAsync({
        reportId,
        recipientLabel: recipient.trim() || undefined,
      })
      .catch(() => null);
    return res?.url ?? null;
  }

  async function emailToClient() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    const url = await ensureShare();
    if (!url) return;
    const subject = encodeURIComponent(
      `${project?.name ? `${project.name} — ` : ""}Progress Report №${report!.reportNumber}`
    );
    const body = encodeURIComponent(
      `Please find our Progress Report №${report!.reportNumber} for the period ${formatDate(report!.periodStart)} – ${formatDate(report!.periodEnd)}:\n\n${url}\n\n` +
        (report!.hasPassword
          ? "The PDF is password-protected — I will send the password separately.\n\n"
          : "") +
        "Kind regards"
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  async function whatsapp() {
    const url = await ensureShare();
    if (!url) return;
    const text = encodeURIComponent(
      `${project?.name ? `${project.name} — ` : ""}Progress Report №${report!.reportNumber}: ${url}` +
        (report!.hasPassword ? " (password to follow separately)" : "")
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
  }

  return (
    <div className="space-y-4">
      <ProjectBreadcrumb
        items={[
          { label: "Reports", href: `/projects/${projectId}/reports` },
          { label: `Report №${report.reportNumber} — Send` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Seal & send */}
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                Report № {report.reportNumber}{" "}
                {sealed ? "is sealed" : "— not sealed yet"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                {sealed ? " · PDF generated" : " · still generating"}
              </p>
            </div>

            {report.hasPassword && (
              <div className="rounded-lg border p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  AES-256 encrypted PDF · password
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 font-mono text-lg font-semibold">
                    {password ?? "•••••••••••"}
                  </span>
                  {password ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copy(password, "Password")}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reveal.isPending}
                      onClick={() => reveal.mutate({ reportId })}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {reveal.isPending ? "…" : "Reveal"}
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 flex items-start gap-1 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  Send the password by a separate channel (text, call). The
                  link alone opens nothing.
                </p>
              </div>
            )}

            {share ? (
              <div className="rounded-lg border p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Share link
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Input readOnly value={share.url} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(share.url, "Link")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-muted-foreground"
                  disabled={revokeShare.isPending}
                  onClick={() => revokeShare.mutate({ shareId: share.id })}
                >
                  Withdraw this link
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="send-recipient">Who is it going to? (optional)</Label>
                <Input
                  id="send-recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="e.g. K. Osei — Harlow Estates"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={!sealed || createShare.isPending}
                onClick={emailToClient}
                className={cn(confirming && "bg-foreground text-background hover:bg-foreground")}
              >
                <Mail className="mr-1.5 h-4 w-4" />
                {confirming ? "Confirm — open email to send" : "Email to client"}
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={!sealed || createShare.isPending}
                onClick={whatsapp}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                WhatsApp
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Both open in your own account, pre-written with the tracked
              link — so it genuinely comes from you. The password never goes
              in the same message.
            </p>
          </CardContent>
        </Card>

        {/* Receipt */}
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <h2 className="text-base font-semibold">Delivery receipt</h2>
            <ul className="space-y-2.5">
              <ReceiptStep
                done={!!share}
                label="Link created & sent"
                detail={
                  share
                    ? `${share.createdAt ? formatDateTime(share.createdAt) : ""}${share.recipientLabel ? ` · to ${share.recipientLabel}` : ""}`
                    : "Not sent yet — seal & send on the left"
                }
              />
              <ReceiptStep
                done={!!share?.openedAt}
                label={`Link opened${share && share.openCount > 1 ? ` (${share.openCount}×)` : ""}`}
                detail={
                  share?.openedAt
                    ? formatDateTime(share.openedAt)
                    : "Waiting — updates live"
                }
              />
              <ReceiptStep
                done={!!share?.downloadedAt}
                label="PDF downloaded"
                detail={
                  share?.downloadedAt
                    ? formatDateTime(share.downloadedAt)
                    : "Waiting"
                }
              />
              <ReceiptStep
                done={false}
                label="Client sign-off"
                detail="Never auto-completed — chase it like the contract says"
              />
            </ul>
            <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
              These receipts are your evidence that reporting obligations
              were met — and your renewal argument.
            </p>

            {share && (
              <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-green-700 dark:text-green-400">
                  {opened ? "The £99 moment — witnessed" : "Sent — awaiting first open"}
                </p>
                <p className="mt-1 text-sm">
                  {opened
                    ? `Your client opened Report № ${report.reportNumber}. Close the period and Report № ${(gaps?.lastReportNumber ?? report.reportNumber) + 1} opens with the programme-refresh ritual queued.`
                    : "Once it's opened you can close the period — or close it now if you're done."}
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={closePeriod.isPending}
                  onClick={() => closePeriod.mutate({ id: projectId })}
                >
                  Close the period — start Report №{" "}
                  {(gaps?.lastReportNumber ?? report.reportNumber) + 1}
                </Button>
              </div>
            )}

            <Link
              href={`/projects/${projectId}/reports`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              ← Back to reports
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReceiptStep({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      {done ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", done ? "font-medium" : "text-muted-foreground")}>
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}
