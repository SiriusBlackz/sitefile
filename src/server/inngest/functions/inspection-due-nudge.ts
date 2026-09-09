import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db";
import { auditLog, inspectionItems, projectMembers, projects, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/services/audit";
import { CLOSED_STATUSES, OVERSIGHT_ROLES } from "@/lib/inspection-transitions";

/**
 * Daily due-date sweep for inspection projects (gate B6).
 *
 * Finds items past, or within three days of, their contractual correction
 * date that are not closed, one nudge per project per day (guarded by the
 * last `nudge` audit entry). The audit entry is the record; email goes out
 * only when RESEND_API_KEY is configured, to the project's oversight
 * members. In-app, the same list is always visible in DueItemsPanel, so a
 * missing key degrades to "no email", never to "no nudge".
 *
 * After deploying: PUT https://www.sitefile.app/api/inngest so the cron
 * registers (the Vercel integration has not synced new functions before).
 */
const LOOKAHEAD_DAYS = 3;
const MIN_GAP_HOURS = 20;

export async function runInspectionDueSweep(now: Date = new Date(), onlyProjectId?: string) {
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000).toISOString().slice(0, 10);
  const since = new Date(now.getTime() - MIN_GAP_HOURS * 3600000);

  const targets = await db.query.projects.findMany({
    where: and(
      eq(projects.projectType, "inspection"),
      eq(projects.status, "active"),
      ...(onlyProjectId ? [eq(projects.id, onlyProjectId)] : [])
    ),
    columns: { id: true, name: true, reference: true },
  });
  let nudged = 0;
  let emailed = 0;
  for (const project of targets) {
    const items = await db.query.inspectionItems.findMany({
      where: and(
        eq(inspectionItems.projectId, project.id),
        lte(inspectionItems.correctionDue, horizon),
        sql`${inspectionItems.status} NOT IN (${sql.join([...CLOSED_STATUSES].map((s) => sql`${s}`), sql`, `)})`
      ),
      columns: { id: true, ref: true, title: true, correctionDue: true, status: true },
      orderBy: (t, { asc }) => [asc(t.correctionDue), asc(t.seq)],
    });
    if (items.length === 0) continue;

    const recent = await db.query.auditLog.findFirst({
      where: and(eq(auditLog.projectId, project.id), eq(auditLog.action, "nudge"), gte(auditLog.createdAt, since)),
      columns: { id: true },
    });
    if (recent) continue;

    const overdue = items.filter((it) => (it.correctionDue ?? "") < today);
    const dueSoon = items.filter((it) => (it.correctionDue ?? "") >= today);

    // Oversight members with a live login.
    const members = await db
      .select({ email: users.email, name: users.name })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(
          eq(projectMembers.projectId, project.id),
          inArray(projectMembers.role, [...OVERSIGHT_ROLES]),
          isNull(users.deactivatedAt)
        )
      );

    let delivery: "email" | "in_app_only" = "in_app_only";
    const key = process.env.RESEND_API_KEY;
    if (key && members.length > 0) {
      const line = (it: (typeof items)[number]) => `${it.ref} — ${it.title} (due ${it.correctionDue})`;
      const text = [
        `${project.name}${project.reference ? ` (${project.reference})` : ""} — defects register due dates`,
        "",
        overdue.length ? `Past the correction date (${overdue.length}):\n${overdue.map(line).join("\n")}` : "",
        dueSoon.length ? `Due within ${LOOKAHEAD_DAYS} days (${dueSoon.length}):\n${dueSoon.map(line).join("\n")}` : "",
        "",
        `Open the register: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.sitefile.app"}/projects/${project.id}/inspection`,
        "",
        "Dates are computed from the notification date and the project correction period — confirm against the contract.",
      ].filter((s) => s !== "").join("\n");
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.NUDGE_FROM_EMAIL ?? "Sitefile <notifications@sitefile.app>",
            to: members.map((m) => m.email),
            subject: `${project.name}: ${overdue.length ? `${overdue.length} defect${overdue.length === 1 ? "" : "s"} past correction date` : `${dueSoon.length} defect${dueSoon.length === 1 ? "" : "s"} due within ${LOOKAHEAD_DAYS} days`}`,
            text,
          }),
        });
        if (res.ok) {
          delivery = "email";
          emailed++;
        } else {
          console.error(`[inspection-due-nudge] Resend ${res.status} for project ${project.id}`);
        }
      } catch (err) {
        console.error(`[inspection-due-nudge] email failed for project ${project.id}`, err);
      }
    }

    await writeAuditLog(db, {
      projectId: project.id,
      userId: null,
      action: "nudge",
      entityType: "project",
      entityId: project.id,
      metadata: {
        overdue: overdue.map((it) => it.ref),
        dueSoon: dueSoon.map((it) => it.ref),
        delivery,
        recipients: delivery === "email" ? members.length : 0,
      },
    });
    nudged++;
  }
  return { projects: targets.length, nudged, emailed };
}

export const inspectionDueNudge = inngest.createFunction(
  {
    id: "inspection-due-nudge",
    retries: 1,
    triggers: [{ cron: "0 7 * * *" }],
  },
  async ({ step }) => {
    return step.run("sweep", () => runInspectionDueSweep());
  }
);
