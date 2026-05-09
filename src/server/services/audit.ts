import { auditLog } from "@/server/db/schema";
import type { db as dbType } from "@/server/db";

// Accept either the top-level db client or a transaction — both expose .insert.
type DB = typeof dbType;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type DBOrTx = DB | Tx;

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "upload"
  | "link"
  | "unlink"
  | "generate"
  | "import"
  | "subscribe"
  | "payment_failed"
  | "cancel_subscription"
  | "bulk_link"
  | "add_member"
  | "remove_member";

export type AuditEntityType =
  | "project"
  | "task"
  | "evidence"
  | "evidence_link"
  | "report"
  | "gps_zone"
  | "subscription"
  | "project_member";

export interface AuditEntry {
  projectId: string;
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Errors propagate — if you're outside a transaction
 * and want fire-and-forget semantics, use writeAuditLogAsync.
 *
 * Inside a transaction, DO NOT swallow errors: a failed insert aborts the
 * postgres transaction, and silently catching here causes the outer commit
 * to roll back everything without the caller knowing.
 */
export async function writeAuditLog(
  db: DBOrTx,
  entry: AuditEntry
): Promise<void> {
  await db.insert(auditLog).values({
    projectId: entry.projectId,
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? null,
  });
}

/**
 * Optional reporter for audit-write failures — wire to Sentry, Inngest DLQ,
 * or a metric counter from app bootstrap. Keep this side-effect-free if it
 * throws; we'd never want a broken reporter to take down a working request.
 */
export type AuditFailureReporter = (failure: {
  entry: AuditEntry;
  error: unknown;
}) => void | Promise<void>;

let failureReporter: AuditFailureReporter | null = null;

export function setAuditFailureReporter(fn: AuditFailureReporter | null): void {
  failureReporter = fn;
}

function reportAuditFailure(entry: AuditEntry, error: unknown): void {
  // Single structured log line — greppable in Vercel logs and easy to alert
  // on. Drops metadata (may contain user-supplied freeform JSON) to keep the
  // log line bounded in size.
  console.error(
    JSON.stringify({
      type: "audit_failure",
      timestamp: new Date().toISOString(),
      projectId: entry.projectId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    })
  );
  if (failureReporter) {
    void Promise.resolve(failureReporter({ entry, error })).catch(
      (reporterErr) => {
        console.error("[audit] failureReporter threw:", reporterErr);
      }
    );
  }
}

/**
 * Fire-and-forget audit log write for non-transactional callers. Failures
 * are reported via the structured failure pipeline (greppable JSON log line
 * + optional reporter hook) instead of being silently swallowed by a plain
 * console.error. Use inside a tRPC mutation when an audit failure shouldn't
 * block the user action.
 */
export function writeAuditLogAsync(db: DBOrTx, entry: AuditEntry): void {
  writeAuditLog(db, entry).catch((err) => {
    reportAuditFailure(entry, err);
  });
}
