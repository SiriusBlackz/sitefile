import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../index";
import {
  projects,
  projectMembers,
  tasks,
  evidence,
  auditLog,
} from "@/server/db/schema";
import type { Context } from "../context";

/**
 * Resolve the set of projects this user can see on the dashboard.
 * - Admins: every project in their org.
 * - Members: only projects they're listed in via project_members.
 *
 * Returns an array of `{ id, status }` so the caller can build counts and
 * use the IDs for sub-queries (tasks, evidence, audit log) without a second
 * round-trip.
 */
async function listAccessibleProjects(
  ctx: Context & { userId: string; orgId: string; dbUser: { role: string } }
): Promise<{ id: string; status: string | null }[]> {
  if (ctx.dbUser.role === "admin") {
    return ctx.db
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(eq(projects.orgId, ctx.orgId));
  }
  const rows = await ctx.db
    .select({ id: projects.id, status: projects.status })
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
