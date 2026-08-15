"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download, Loader2, FileText, Lock, Send } from "lucide-react";
import { ShareDialog } from "./share-dialog";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

interface Report {
  id: string;
  reportNumber: number;
  periodStart: string;
  periodEnd: string;
  status: string | null;
  hasPassword: boolean;
  createdAt: Date | null;
}

interface ReportListProps {
  reports: Report[];
}

export function ReportList({ reports }: ReportListProps) {
  const downloadMutation = trpc.report.download.useMutation();
  // Transient UI state for the spinner + password dialog.
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pwPrompt, setPwPrompt] = useState<Report | null>(null);
  const [downloadPassword, setDownloadPassword] = useState("");
  const [shareReport, setShareReport] = useState<Report | null>(null);

  async function runDownload(report: Report, password?: string) {
    setLoadingId(report.id);
    try {
      const result = await downloadMutation.mutateAsync({
        id: report.id,
        password,
      });
      // Programmatic anchor click (same-origin URL + download attribute):
      // popup blockers (Safari) silently eat window.open after an async
      // round-trip, but anchor-initiated downloads are never blocked.
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setPwPrompt(null);
      setDownloadPassword("");
    } catch (err) {
      if (
        err instanceof TRPCClientError &&
        err.message === "Password required"
      ) {
        setPwPrompt(report);
        return;
      }
      const msg = err instanceof Error ? err.message : "Download failed";
      toast.error(msg);
      setPwPrompt(null);
      setDownloadPassword("");
    } finally {
      setLoadingId(null);
    }
  }

  function handleDownload(report: Report) {
    if (report.hasPassword) {
      setPwPrompt(report);
      return;
    }
    void runDownload(report);
  }

  function handlePasswordSubmit() {
    if (!pwPrompt || !downloadPassword) return;
    void runDownload(pwPrompt, downloadPassword);
  }

  if (reports.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <FileText className="mx-auto mb-3 h-8 w-8" />
        No reports generated yet. Click &quot;Generate Report&quot; to create your first one.
      </div>
    );
  }

  return (
    <>
      {/* Horizontal scroll container so the Actions column stays reachable
          on narrow (mobile) viewports. */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report #</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Protected</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">#{report.reportNumber}</TableCell>
                <TableCell>
                  {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                </TableCell>
                <TableCell>
                  <span role="status" aria-live="polite">
                    <StatusBadge status={report.status ?? "generating"} />
                  </span>
                </TableCell>
                <TableCell>
                  {report.hasPassword ? (
                    <Lock className="h-4 w-4 text-amber-500" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(report.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    className="mr-1.5"
                    disabled={report.status !== "completed"}
                    onClick={() => setShareReport(report)}
                  >
                    <Send className="mr-1 h-3 w-3" />
                    Send
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={report.status !== "completed" || loadingId === report.id}
                    onClick={() => handleDownload(report)}
                  >
                    {loadingId === report.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3 w-3" />
                    )}
                    Download
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {shareReport && (
        <ShareDialog
          open={!!shareReport}
          onOpenChange={(open) => {
            if (!open) setShareReport(null);
          }}
          reportId={shareReport.id}
          reportNumber={shareReport.reportNumber}
          hasPassword={shareReport.hasPassword}
        />
      )}

      <Dialog
        open={!!pwPrompt}
        onOpenChange={(open) => {
          if (!open) {
            setPwPrompt(null);
            setDownloadPassword("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Password required</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Enter report password"
              autoFocus
              value={downloadPassword}
              onChange={(e) => setDownloadPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePasswordSubmit();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handlePasswordSubmit}
              disabled={!downloadPassword || loadingId === pwPrompt?.id}
            >
              {loadingId === pwPrompt?.id ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        >
          Completed
        </Badge>
      );
    case "generating":
      return (
        <Badge
          variant="secondary"
          className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        >
          Generating
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="secondary"
          className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        >
          Failed
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
