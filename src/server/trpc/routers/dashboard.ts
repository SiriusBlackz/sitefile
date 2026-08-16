import { eq, and, asc, desc, sql, inArray, isNull } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../index";
import {
  projects,
  projectMembers,
  tasks,
  evidence,
  auditLog,
  reports,
  reportShares,
  reportDrafts,
} from "@/server/db/schema";
import type { Context } from "../context";

type AccessibleProject = {
  id: string;
  name: string;
  status: string | null;
};

/**
 * Resolve the set of projects this user can see on the dashboard.
 * - Admins: every project in their org.
 * - Members: only projects they're listed in via project_members.
 */
async function listAccessibleProjects(
  ctx: Context & { userId: string; orgId: string; dbUser: { role: string } }
): Promise<AccessibleProject[]> {
  if (ctx.dbUser.role === "admin") {
    return ctx.db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.orgId, ctx.orgId));
  }
  const rows = await ctx.db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(
      and(
        eq(projects.orgId, ctx.orgId),
        eq(projectMembers.userId, ctx.userId)
      )
    );
  return rows;
}

export const dashboardRouter = createTRPCRouter({
  // Portfolio: everything the org home needs for its per-project cards
  // in a handful of grouped queries — never N per-project gapList calls.
  portfolio: protectedProcedure.query(async ({ ctx }) => {
    const accessible = await listAccessibleProjects(ctx);
    const ids = accessible.map((p) => p.id);
    if (ids.length === 0) return { projects: [] };

    const projectRows = await ctx.db
      .select({
        id: projects.id,
        name: projects.name,
        reference: projects.reference,
        status: projects.status,
        startDate: projects.startDate,
        nextReportDue: projects.nextReportDue,
        reportingFrequency: projects.reportingFrequency,
        programmeConfirmedAt: projects.programmeConfirmedAt,
      })
      .from(projects)
      .where(inArray(projects.id, ids));

    // Last completed report per project.
    const lastReports = await ctx.db
      .select({
        id: reports.id,
        projectId: reports.projectId,
        reportNumber: reports.reportNumber,
        status: reports.status,
        periodEnd: reports.periodEnd,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(
        and(
          inArray(reports.projectId, ids),
          eq(reports.status, "completed"),
          sql`${reports.reportNumber} = (
            select max(r2.report_number) from reports r2
            where r2.project_id = ${reports.projectId} and r2.status = 'completed'
          )`
        )
      );
    const lastByProject = new Map(lastReports.map((r) => [r.projectId, r]));

    // Delivery state for those reports.
    const lastIds = lastReports.map((r) => r.id);
    const shares = lastIds.length
      ? await ctx.db.query.reportShares.findMany({
          where: inArray(reportShares.reportId, lastIds),
          with: { events: true },
        })
      : [];
    const shareByReport = new Map<string, (typeof shares)[number]>();
    for (const sh of shares) {
      const prev = shareByReport.get(sh.reportId);
      if (!prev || (sh.createdAt && prev.createdAt && sh.createdAt > prev.createdAt)) {
        shareByReport.set(sh.reportId, sh);
      }
    }

    // Task counts per project.
    const taskCounts = await ctx.db
      .select({ projectId: tasks.projectId, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(inArray(tasks.projectId, ids))
      .groupBy(tasks.projectId);
    const taskCountBy = new Map(taskCounts.map((t) => [t.projectId, t.count]));

    // Evidence rows (per-period photo + unlinked counts computed in JS —
    // the period boundary differs per project).
    const evRows = await ctx.db
      .select({
        projectId: evidence.projectId,
        capturedAt: evidence.capturedAt,
        uploadedAt: evidence.uploadedAt,
        linkCount: sql<number>`(select count(*) from evidence_links el where el.evidence_id = ${evidence.id})::int`,
      })
      .from(evidence)
      .where(and(inArray(evidence.projectId, ids), isNull(evidence.deletedAt)));

    const drafts = await ctx.db.query.reportDrafts.findMany({
      where: inArray(reportDrafts.projectId, ids),
    });
    const draftBy = new Map(drafts.map((d) => [d.projectId, d]));

    const out = projectRows.map((p) => {
      const last = lastByProject.get(p.id) ?? null;
      const periodStartStr =
        last?.periodEnd ?? p.startDate ?? new Date().toISOString().slice(0, 10);
      const periodStart = new Date(periodStartStr + "T00:00:00Z");
      const mine = evRows.filter((e) => e.projectId === p.id);
      const inPeriod = mine.filter((e) => {
        const at = e.capturedAt ?? e.uploadedAt;
        return at != null && at >= periodStart;
      });
      const share = last ? (shareByReport.get(last.id) ?? null) : null;
      const opened =
        share?.events
          .filter((e) => e.event === "opened" && e.createdAt)
          .map((e) => e.createdAt!)
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      const draft = draftBy.get(p.id);
      const payload =
        draft && draft.periodStart === periodStartStr
          ? (draft.payload as {
              narrativeApprovedAt?: string | null;
              issuesSignedOffAt?: string | null;
              signedAt?: string | null;
            })
          : null;
      return {
        id: p.id,
        name: p.name,
        reference: p.reference,
        status: p.status,
        nextReportDue: p.nextReportDue,
        reportingFrequency: p.reportingFrequency,
        periodStart: periodStartStr,
        taskCount: taskCountBy.get(p.id) ?? 0,
        photosThisPeriod: inPeriod.length,
        unlinked: inPeriod.filter((e) => e.linkCount === 0).length,
        programmeConfirmedThisPeriod:
          p.programmeConfirmedAt != null && p.programmeConfirmedAt >= periodStart,
        lastReport: last
          ? {
              id: last.id,
              number: last.reportNumber,
              status: last.status,
              sentAt: share?.createdAt?.toISOString() ?? null,
              openedAt: opened?.toISOString() ?? null,
            }
          : null,
        draft: payload
          ? {
              narrativeApprovedAt: payload.narrativeApprovedAt ?? null,
              issuesSignedOffAt: payload.issuesSignedOffAt ?? null,
              signedAt: payload.signedAt ?? null,
            }
          : null,
      };
    });

    return { projects: out };
  }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const accessible = await listAccessibleProjects(ctx);

    const projectCounts = { total: accessible.length, active: 0, archived: 0 };
    for (const p of accessible) {
      if (p.status === "active") projectCounts.active++;
      if (p.status === "archived") projectCounts.archived++;
    }

    const projectIds = accessible.map((p) => p.id);

    if (projectIds.length === 0) {
      return {
        projects: projectCounts,
        tasks: { total: 0, completed: 0, delayed: 0 },
        evidence: { total: 0, thisWeek: 0 },
      };
    }

    // Task stats with SQL aggregation
    const taskStats = await ctx.db
      .select({
        status: tasks.status,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.status);

    const taskCounts = { total: 0, completed: 0, delayed: 0 };
    for (const row of taskStats) {
      taskCounts.total += row.count;
      if (row.status === "completed") taskCounts.completed = row.count;
      if (row.status === "delayed") taskCounts.delayed = row.count;
    }

    // Evidence counts with SQL aggregation.
    // Bind the cutoff as an ISO string — passing a JS Date through drizzle's
    // sql template into a FILTER clause was failing parameter binding on
    // postgres-js, returning the whole query as a 500.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();

    const [evidenceStats] = await ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        thisWeek: sql<number>`count(*) filter (where ${evidence.createdAt} >= ${sevenDaysAgoIso})::int`,
      })
      .from(evidence)
      .where(and(inArray(evidence.projectId, projectIds), isNull(evidence.deletedAt)));

    return {
      projects: projectCounts,
      tasks: taskCounts,
      evidence: {
        total: evidenceStats?.total ?? 0,
        thisWeek: evidenceStats?.thisWeek ?? 0,
      },
    };
  }),

  projectsTable: protectedProcedure.query(async ({ ctx }) => {
    const accessible = await listAccessibleProjects(ctx);
    const visible = accessible.filter((p) => p.status !== "archived");
    if (visible.length === 0) return [];

    const projectIds = visible.map((p) => p.id);

    // Per-project task counts (total + completed) in a single grouped query.
    const taskRows = await ctx.db
      .select({
        projectId: tasks.projectId,
        status: tasks.status,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.projectId, tasks.status);

    const taskTotals = new Map<string, { total: number; completed: number }>();
    for (const row of taskRows) {
      const bucket = taskTotals.get(row.projectId) ?? { total: 0, completed: 0 };
      bucket.total += row.count;
      if (row.status === "completed") bucket.completed += row.count;
      taskTotals.set(row.projectId, bucket);
    }

    // Per-project evidence counts.
    const evidenceRows = await ctx.db
      .select({
        projectId: evidence.projectId,
        count: sql<number>`count(*)::int`,
      })
      .from(evidence)
      .where(and(inArray(evidence.projectId, projectIds), isNull(evidence.deletedAt)))
      .groupBy(evidence.projectId);

    const evidenceTotals = new Map<string, number>();
    for (const row of evidenceRows) evidenceTotals.set(row.projectId, row.count);

    // Candidate "current task" rows: anything not yet completed, ordered so
    // the first row per project is the one we want to show. Pick in JS to
    // avoid per-project round trips or fragile DISTINCT ON SQL.
    const candidateTasks = await ctx.db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        name: tasks.name,
        status: tasks.status,
        plannedStart: tasks.plannedStart,
        sortOrder: tasks.sortOrder,
      })
      .from(tasks)
      .where(
        and(
          inArray(tasks.projectId, projectIds),
          inArray(tasks.status, ["in_progress", "delayed", "not_started"])
        )
      )
      .orderBy(
        tasks.projectId,
        // Status priority: in_progress (1) → delayed (2) → not_started (3).
        sql`CASE ${tasks.status}
          WHEN 'in_progress' THEN 1
          WHEN 'delayed' THEN 2
          WHEN 'not_started' THEN 3
          ELSE 4
        END`,
        sql`${tasks.plannedStart} NULLS LAST`,
        asc(tasks.sortOrder)
      );

    const currentTaskByProject = new Map<string, { id: string; name: string }>();
    for (const t of candidateTasks) {
      if (!currentTaskByProject.has(t.projectId)) {
        currentTaskByProject.set(t.projectId, { id: t.id, name: t.name });
      }
    }

    return visible.map((p) => {
      const counts = taskTotals.get(p.id) ?? { total: 0, completed: 0 };
      const current = currentTaskByProject.get(p.id) ?? null;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        tasks: counts,
        evidenceCount: evidenceTotals.get(p.id) ?? 0,
        currentTask: current,
      };
    });
  }),

  recentActivity: protectedProcedure.query(async ({ ctx }) => {
    const accessible = await listAccessibleProjects(ctx);
    const projectIds = accessible.map((p) => p.id);

    if (projectIds.length === 0) return [];

    const entries = await ctx.db.query.auditLog.findMany({
      where: inArray(auditLog.projectId, projectIds),
      orderBy: [desc(auditLog.createdAt)],
      limit: 15,
      with: {
        user: { columns: { id: true, name: true, avatarUrl: true } },
        project: { columns: { id: true, name: true } },
      },
    });

    return entries.map((e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      metadata: e.metadata as Record<string, unknown> | null,
      createdAt: e.createdAt,
      user: e.user ? { name: e.user.name, avatarUrl: e.user.avatarUrl } : null,
      project: e.project ? { id: e.project.id, name: e.project.name } : null,
    }));
  }),
});
