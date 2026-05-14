import { eq, and, asc, desc, sql, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../index";
import {
  projects,
  projectMembers,
  tasks,
  evidence,
  auditLog,
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
      .where(inArray(evidence.projectId, projectIds));

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
      .where(inArray(evidence.projectId, projectIds))
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
