import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  projects,
  projectMembers,
  users,
  tasks,
  evidence,
  gpsZones,
} from "@/server/db/schema";
import type { db as dbType } from "@/server/db";

type DB = typeof dbType;

/** Project statuses that block billable write operations. */
const INACTIVE_BILLING_STATUSES = new Set([
  "pending_payment",
  "payment_failed",
  "cancelled",
]);

/**
 * Verify the project exists, belongs to the user's organisation,
 * and the user is either an org admin or a project member.
 * Throws FORBIDDEN if the org doesn't match or user lacks access, NOT_FOUND if missing.
 *
 * Pass `{ requireActive: true }` on billable writes (uploads, imports,
 * report generation) so projects without a live subscription are
 * read-only. Demo-mode projects are created "active" so this never
 * affects them.
 */
export async function assertProjectAccess(
  db: DB,
  projectId: string,
  orgId: string,
  userId?: string | null,
  opts?: { requireActive?: boolean }
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, orgId: true, status: true },
  });
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  if (project.orgId !== orgId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  if (
    opts?.requireActive &&
    project.status &&
    INACTIVE_BILLING_STATUSES.has(project.status)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This project does not have an active subscription. Complete payment in Settings to continue.",
    });
  }

  // If userId provided, check that user is an org admin or a project member
  if (userId) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    // Org admins can access all projects in their org
    if (user?.role === "admin") return project;

    // Otherwise, must be a project member
    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ),
      columns: { id: true },
    });
    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this project" });
    }
  }

  return project;
}

export async function assertTaskInProject(db: DB, taskId: string, projectId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { id: true, projectId: true },
  });
  if (!task) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
  }
  if (task.projectId !== projectId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Task does not belong to this project" });
  }
  return task;
}

export async function assertEvidenceInProject(db: DB, evidenceId: string, projectId: string) {
  const ev = await db.query.evidence.findFirst({
    where: eq(evidence.id, evidenceId),
    columns: { id: true, projectId: true },
  });
  if (!ev) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Evidence not found" });
  }
  if (ev.projectId !== projectId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Evidence does not belong to this project" });
  }
  return ev;
}

export async function assertZoneInProject(db: DB, zoneId: string, projectId: string) {
  const zone = await db.query.gpsZones.findFirst({
    where: eq(gpsZones.id, zoneId),
    columns: { id: true, projectId: true },
  });
  if (!zone) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Zone not found" });
  }
  if (zone.projectId !== projectId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Zone does not belong to this project" });
  }
  return zone;
}
