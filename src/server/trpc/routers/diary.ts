import { z } from "zod";
import { and, eq, desc, gte, lte, isNull, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../index";
import {
  projects,
  users,
  tasks,
  evidence,
  projectMembers,
  diaryEntries,
  diaryWorkLines,
  diaryResources,
  diaryHoldups,
  diaryHoldupDays,
  diaryEvents,
} from "@/server/db/schema";
import {
  DIARY_PROVENANCE,
  DIARY_WORK_SOURCES,
  DIARY_RESOURCE_KINDS,
  HOLDUP_CAUSES,
} from "@/server/db/enums";
import { assertProjectAccess } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import {
  localDateString,
  isWorkingDay,
  workingDatesBetween,
  effectiveDiaryStatus,
  computeStreak,
  DEFAULT_WORKING_DAYS,
  type WorkingDays,
} from "@/lib/dates";
import { deriveSiteCoords, fetchPeriodWeather } from "@/server/services/weather";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const provenanceEnum = z.enum(DIARY_PROVENANCE);

const workLineSchema = z.object({
  taskId: z.string().uuid().nullish(),
  body: z.string().trim().min(1).max(500),
  source: z.enum(DIARY_WORK_SOURCES),
  provenance: provenanceEnum,
  confirmed: z.boolean(),
  evidenceIds: z.array(z.string().uuid()).max(50).optional(),
  sortOrder: z.number().int().min(0).max(999),
});

const resourceSchema = z.object({
  kind: z.enum(DIARY_RESOURCE_KINDS),
  label: z.string().trim().max(80).default(""),
  qty: z.number().min(0).max(9999),
  note: z.string().trim().max(500).optional(),
  provenance: provenanceEnum,
});

/**
 * Amendment apply schema — deliberately default-FREE. zod 4's .partial()
 * re-materialises .default() values, which made every work-note amendment
 * silently zero the locked day's safety counts (caught by the final-gate
 * guard). Absent here must MEAN absent.
 */
const amendApplySchema = z.object({
  workNote: z.string().trim().max(4000).nullish(),
  visitorsCount: z.number().int().min(0).max(999).optional(),
  inspectionsCount: z.number().int().min(0).max(999).optional(),
  toolboxTalk: z.boolean().optional(),
  toolboxTopic: z.string().trim().max(200).nullish(),
  incidentsCount: z.number().int().min(0).max(999).optional(),
  safetyNote: z.string().trim().max(2000).nullish(),
});

const entryPayloadSchema = z.object({
  workNote: z.string().trim().max(4000).optional(),
  visitorsCount: z.number().int().min(0).max(999).default(0),
  inspectionsCount: z.number().int().min(0).max(999).default(0),
  toolboxTalk: z.boolean().default(false),
  toolboxTopic: z.string().trim().max(200).optional(),
  incidentsCount: z.number().int().min(0).max(999).default(0),
  safetyNote: z.string().trim().max(2000).optional(),
  provenance: z.record(z.string(), provenanceEnum).default({}),
  workLines: z.array(workLineSchema).max(60).default([]),
  resources: z.array(resourceSchema).max(30).default([]),
});

type ProjectRow = {
  id: string;
  timezone: string;
  workingDays: unknown;
  startDate: string | null;
  createdAt: Date | null;
};

/** No diary is owed before the project existed. */
function projectFloorDate(project: ProjectRow): string {
  const createdLocal = project.createdAt
    ? localDateString(project.createdAt, project.timezone || "Europe/London")
    : null;
  if (project.startDate && createdLocal) {
    return project.startDate < createdLocal ? project.startDate : createdLocal;
  }
  return project.startDate ?? createdLocal ?? "1970-01-01";
}

function projectWorkingDays(project: { workingDays: unknown }): WorkingDays {
  const wd = project.workingDays;
  if (Array.isArray(wd) && wd.every((n) => typeof n === "number")) {
    return wd as WorkingDays;
  }
  return DEFAULT_WORKING_DAYS;
}

async function loadProject(
  db: Parameters<typeof assertProjectAccess>[0],
  projectId: string
): Promise<ProjectRow> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      id: true,
      timezone: true,
      workingDays: true,
      startDate: true,
      createdAt: true,
    },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  return project;
}

/** PM oversight gate: org admin OR a management project role. */
async function assertPmView(
  db: Parameters<typeof assertProjectAccess>[0],
  projectId: string,
  userId: string,
  orgRole: string
) {
  if (orgRole === "admin") return;
  const membership = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId)
    ),
    columns: { role: true },
  });
  const allowed = ["admin", "project_manager", "construction_manager"];
  if (!membership || !allowed.includes(membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The site diary overview is for project managers.",
    });
  }
}

/** Scalars copied between payload and the diary_entries row. */
function entryScalars(payload: z.infer<typeof entryPayloadSchema>) {
  return {
    workNote: payload.workNote ?? null,
    visitorsCount: payload.visitorsCount,
    inspectionsCount: payload.inspectionsCount,
    toolboxTalk: payload.toolboxTalk,
    toolboxTopic: payload.toolboxTopic ?? null,
    incidentsCount: payload.incidentsCount,
    safetyNote: payload.safetyNote ?? null,
    provenance: payload.provenance,
  };
}

async function replaceChildren(
  db: Parameters<typeof assertProjectAccess>[0],
  entryId: string,
  payload: z.infer<typeof entryPayloadSchema>
) {
  await db.delete(diaryWorkLines).where(eq(diaryWorkLines.entryId, entryId));
  await db.delete(diaryResources).where(eq(diaryResources.entryId, entryId));
  if (payload.workLines.length > 0) {
    await db.insert(diaryWorkLines).values(
      payload.workLines.map((l) => ({
        entryId,
        taskId: l.taskId ?? null,
        body: l.body,
        source: l.source,
        provenance: l.provenance,
        confirmed: l.confirmed,
        evidenceIds: l.evidenceIds ?? null,
        sortOrder: l.sortOrder,
      }))
    );
  }
  if (payload.resources.length > 0) {
    await db.insert(diaryResources).values(
      payload.resources.map((r) => ({
        entryId,
        kind: r.kind,
        label: r.label ?? "",
        qty: r.qty,
        note: r.note ?? null,
        provenance: r.provenance,
      }))
    );
  }
}

/** Evidence captured on the site-local date, tz-correct (fetch ±1 UTC day, filter in JS). */
async function evidenceForLocalDay(
  db: Parameters<typeof assertProjectAccess>[0],
  projectId: string,
  localDate: string,
  timezone: string
) {
  const dayStart = new Date(`${localDate}T00:00:00Z`);
  const from = new Date(dayStart.getTime() - 36 * 3600_000);
  const to = new Date(dayStart.getTime() + 60 * 3600_000);
  const rows = await db.query.evidence.findMany({
    where: and(eq(evidence.projectId, projectId), isNull(evidence.deletedAt)),
    columns: {
      id: true,
      capturedAt: true,
      uploadedAt: true,
      note: true,
    },
    with: { links: { columns: { taskId: true } } },
  });
  return rows.filter((r) => {
    const when = r.capturedAt ?? r.uploadedAt;
    if (!when) return false;
    if (when < from || when > to) return false;
    return localDateString(when, timezone) === localDate;
  });
}

export const diaryRouter = createTRPCRouter({
  /** My entry for a day + the prefill payload for the ritual. */
  getDay: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), localDate: dateStr }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const project = await loadProject(ctx.db, input.projectId);
      const workingDays = projectWorkingDays(project);

      const entry = await ctx.db.query.diaryEntries.findFirst({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          eq(diaryEntries.authorId, ctx.userId),
          eq(diaryEntries.entryDate, input.localDate)
        ),
        with: {
          workLines: { orderBy: (t, { asc }) => [asc(t.sortOrder)] },
          resources: true,
        },
      });

      // Amendment history for a locked entry (append-only ◆ trail).
      const amendments = entry
        ? await ctx.db.query.diaryEvents.findMany({
            where: and(
              eq(diaryEvents.entryId, entry.id),
              eq(diaryEvents.kind, "amended")
            ),
            orderBy: [desc(diaryEvents.createdAt)],
          })
        : [];
      const amendmentActorIds = [
        ...new Set(amendments.map((a) => a.actorId).filter(Boolean) as string[]),
      ];
      const amendmentActors = amendmentActorIds.length
        ? await ctx.db.query.users.findMany({
            where: inArray(users.id, amendmentActorIds),
            columns: { id: true, name: true },
          })
        : [];
      const actorName = new Map(amendmentActors.map((u) => [u.id, u.name]));

      // Prefill: yesterday's resources (CARRIED) from my most recent prior entry.
      const prevEntry = await ctx.db.query.diaryEntries.findFirst({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          eq(diaryEntries.authorId, ctx.userId),
          lt(diaryEntries.entryDate, input.localDate)
        ),
        orderBy: [desc(diaryEntries.entryDate)],
        with: { resources: true },
      });

      // Prefill: today's photo→task links become pre-drafted work lines (AUTO).
      const dayEvidence = await evidenceForLocalDay(
        ctx.db,
        input.projectId,
        input.localDate,
        project.timezone
      );
      const byTask = new Map<string, string[]>();
      let unlinkedCount = 0;
      for (const ev of dayEvidence) {
        if (ev.links.length === 0) unlinkedCount++;
        for (const link of ev.links) {
          const list = byTask.get(link.taskId) ?? [];
          list.push(ev.id);
          byTask.set(link.taskId, list);
        }
      }
      const taskRows = byTask.size
        ? await ctx.db.query.tasks.findMany({
            where: inArray(tasks.id, [...byTask.keys()]),
            columns: { id: true, name: true },
          })
        : [];
      const suggestedWorkLines = taskRows.map((t, i) => ({
        taskId: t.id,
        body: t.name,
        source: "photo_link" as const,
        provenance: "auto" as const,
        confirmed: false,
        evidenceIds: byTask.get(t.id) ?? [],
        sortOrder: i,
      }));

      // My open hold-up threads (for "still ongoing? day N").
      const openThreads = await ctx.db.query.diaryHoldups.findMany({
        where: and(
          eq(diaryHoldups.projectId, input.projectId),
          eq(diaryHoldups.authorId, ctx.userId),
          eq(diaryHoldups.status, "open")
        ),
        with: { days: true, task: { columns: { id: true, name: true } } },
      });

      // Today's already-logged hold-up day rows (mine).
      const todaysHoldupDays = await ctx.db.query.diaryHoldupDays.findMany({
        where: and(
          eq(diaryHoldupDays.projectId, input.projectId),
          eq(diaryHoldupDays.reportedBy, ctx.userId),
          eq(diaryHoldupDays.occurredOn, input.localDate)
        ),
        with: { holdup: { columns: { id: true, cause: true, note: true, status: true, taskId: true } } },
      });

      // Single-day weather (display only; frozen into the row at submit).
      let weather = null;
      try {
        const zones = await ctx.db.query.gpsZones.findMany({
          where: (z2, { eq: eq2 }) => eq2(z2.projectId, input.projectId),
          columns: { polygon: true },
        });
        const evPoints = await ctx.db.query.evidence.findMany({
          where: and(eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt)),
          columns: { latitude: true, longitude: true },
          limit: 200,
        });
        const coords = deriveSiteCoords(
          zones.map((z3) => z3.polygon as { coordinates: number[][][] }),
          evPoints
        );
        if (coords) {
          weather = await fetchPeriodWeather(
            coords.latitude,
            coords.longitude,
            input.localDate,
            input.localDate
          );
        }
      } catch {
        weather = null; // weather must never block the diary
      }

      return {
        entry: entry ?? null,
        amendments: amendments.map((a) => ({
          id: a.id,
          field: (a.payload as { field?: string }).field ?? "note",
          previous: (a.payload as { previous?: string | null }).previous ?? null,
          next: (a.payload as { next?: string | null }).next ?? null,
          note: (a.payload as { note?: string }).note ?? null,
          by: a.actorId ? (actorName.get(a.actorId) ?? "Unknown") : "System",
          at: a.createdAt,
        })),
        effectiveStatus: effectiveDiaryStatus(
          entry ?? null,
          input.localDate,
          project.timezone,
          workingDays
        ),
        isWorkingDay: isWorkingDay(input.localDate, workingDays),
        timezone: project.timezone,
        workingDays,
        prefill: {
          workLines: suggestedWorkLines,
          unlinkedPhotoCount: unlinkedCount,
          resources: (prevEntry?.resources ?? []).map((r) => ({
            kind: r.kind,
            label: r.label,
            qty: r.qty,
            note: r.note,
            provenance: "carried" as const,
          })),
          carriedFromDate: prevEntry?.entryDate ?? null,
        },
        openThreads: openThreads.map((t) => ({
          id: t.id,
          cause: t.cause,
          note: t.note,
          taskId: t.taskId,
          taskName: t.task?.name ?? null,
          startedOn: t.startedOn,
          dayCount: t.days.length,
          totalHours: t.days.reduce((s, d) => s + d.hoursLost, 0),
          loggedToday: t.days.some((d) => d.occurredOn === input.localDate),
        })),
        todaysHoldupDays: todaysHoldupDays.map((d) => ({
          id: d.id,
          holdupId: d.holdupId,
          cause: d.holdup.cause,
          note: d.note ?? d.holdup.note,
          taskId: d.holdup.taskId,
          hoursLost: d.hoursLost,
          loggedAt: d.loggedAt,
          ongoing: d.holdup.status === "open",
        })),
        weather,
      };
    }),

  /** Idempotent draft upsert — offline-replay-safe. */
  saveDraft: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        localDate: dateStr,
        enteredAt: z.coerce.date(),
        payload: entryPayloadSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const existing = await ctx.db.query.diaryEntries.findFirst({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          eq(diaryEntries.authorId, ctx.userId),
          eq(diaryEntries.entryDate, input.localDate)
        ),
        columns: { id: true, status: true },
      });
      if (existing && existing.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This day is locked — add an amendment instead.",
        });
      }
      let entryId: string;
      if (existing) {
        entryId = existing.id;
        await ctx.db
          .update(diaryEntries)
          .set({
            ...entryScalars(input.payload),
            enteredAt: input.enteredAt,
            receivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(diaryEntries.id, entryId));
      } else {
        const [row] = await ctx.db
          .insert(diaryEntries)
          .values({
            projectId: input.projectId,
            authorId: ctx.userId,
            entryDate: input.localDate,
            status: "draft",
            enteredAt: input.enteredAt,
            receivedAt: new Date(),
            ...entryScalars(input.payload),
          })
          .onConflictDoNothing()
          .returning();
        if (row) {
          entryId = row.id;
          await ctx.db.insert(diaryEvents).values({
            entryId,
            projectId: input.projectId,
            actorId: ctx.userId,
            kind: "created",
            clientAt: input.enteredAt,
          });
        } else {
          // Concurrent create — fetch and treat as update.
          const again = await ctx.db.query.diaryEntries.findFirst({
            where: and(
              eq(diaryEntries.projectId, input.projectId),
              eq(diaryEntries.authorId, ctx.userId),
              eq(diaryEntries.entryDate, input.localDate)
            ),
            columns: { id: true, status: true },
          });
          if (!again || again.status !== "draft") {
            throw new TRPCError({ code: "CONFLICT", message: "Entry changed underneath — reload." });
          }
          entryId = again.id;
          await ctx.db
            .update(diaryEntries)
            .set({ ...entryScalars(input.payload), enteredAt: input.enteredAt, receivedAt: new Date(), updatedAt: new Date() })
            .where(eq(diaryEntries.id, entryId));
        }
      }
      await replaceChildren(ctx.db, entryId, input.payload);
      return { entryId };
    }),

  /** Lock the day. Dual stamps; late = entered on a later local calendar day. */
  submit: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        localDate: dateStr,
        enteredAt: z.coerce.date(),
        payload: entryPayloadSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const project = await loadProject(ctx.db, input.projectId);
      const receivedAt = new Date();
      // Foreman gets credit for the client-claimed time; the received stamp
      // stays alongside for honesty.
      const late =
        localDateString(input.enteredAt, project.timezone) > input.localDate;

      const existing = await ctx.db.query.diaryEntries.findFirst({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          eq(diaryEntries.authorId, ctx.userId),
          eq(diaryEntries.entryDate, input.localDate)
        ),
        columns: { id: true, status: true },
      });
      if (existing && existing.status === "locked") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Already locked — add an amendment instead.",
        });
      }

      // Freeze the day's weather snapshot (AUTO) — tolerant of failure.
      let weatherSnapshot: unknown = null;
      try {
        const zones = await ctx.db.query.gpsZones.findMany({
          where: (z2, { eq: eq2 }) => eq2(z2.projectId, input.projectId),
          columns: { polygon: true },
        });
        const evPoints = await ctx.db.query.evidence.findMany({
          where: and(eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt)),
          columns: { latitude: true, longitude: true },
          limit: 200,
        });
        const coords = deriveSiteCoords(
          zones.map((z3) => z3.polygon as { coordinates: number[][][] }),
          evPoints
        );
        if (coords) {
          weatherSnapshot = await fetchPeriodWeather(
            coords.latitude,
            coords.longitude,
            input.localDate,
            input.localDate
          );
        }
      } catch {
        weatherSnapshot = null;
      }

      const lockFields = {
        ...entryScalars(input.payload),
        status: "locked" as const,
        enteredAt: input.enteredAt,
        receivedAt,
        lockedAt: receivedAt,
        late,
        weather: weatherSnapshot,
        updatedAt: receivedAt,
      };

      let entryId: string;
      if (existing) {
        entryId = existing.id;
        await ctx.db.update(diaryEntries).set(lockFields).where(eq(diaryEntries.id, entryId));
      } else {
        const [row] = await ctx.db
          .insert(diaryEntries)
          .values({
            projectId: input.projectId,
            authorId: ctx.userId,
            entryDate: input.localDate,
            ...lockFields,
          })
          .onConflictDoNothing()
          .returning();
        if (!row) {
          throw new TRPCError({ code: "CONFLICT", message: "Entry was created concurrently — reload." });
        }
        entryId = row.id;
      }
      await replaceChildren(ctx.db, entryId, input.payload);

      // Attach my unattached hold-up day rows for this date to the entry.
      await ctx.db
        .update(diaryHoldupDays)
        .set({ entryId })
        .where(
          and(
            eq(diaryHoldupDays.projectId, input.projectId),
            eq(diaryHoldupDays.reportedBy, ctx.userId),
            eq(diaryHoldupDays.occurredOn, input.localDate),
            isNull(diaryHoldupDays.entryId)
          )
        );

      await ctx.db.insert(diaryEvents).values({
        entryId,
        projectId: input.projectId,
        actorId: ctx.userId,
        kind: "submitted",
        payload: { late },
        clientAt: input.enteredAt,
      });
      writeAuditLogAsync(ctx.db, {
        projectId: input.projectId,
        userId: ctx.userId,
        action: "update",
        entityType: "diary_entry",
        entityId: entryId,
        metadata: { event: "diary_submit", entryDate: input.localDate, late },
      });
      return { entryId, late };
    }),

  /** All-day 10-second hold-up log; creates a thread or appends a day row. */
  logHoldup: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        localDate: dateStr,
        cause: z.enum(HOLDUP_CAUSES),
        hoursLost: z.number().min(0.5).max(24),
        taskId: z.string().uuid().nullish(),
        note: z.string().trim().max(1000).optional(),
        evidenceId: z.string().uuid().nullish(),
        ongoing: z.boolean().default(false),
        loggedAt: z.coerce.date(),
        holdupId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      let holdupId = input.holdupId ?? null;
      if (holdupId) {
        const thread = await ctx.db.query.diaryHoldups.findFirst({
          where: and(eq(diaryHoldups.id, holdupId), eq(diaryHoldups.projectId, input.projectId)),
          columns: { id: true, status: true },
        });
        if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Hold-up not found" });
      } else {
        const [thread] = await ctx.db
          .insert(diaryHoldups)
          .values({
            projectId: input.projectId,
            authorId: ctx.userId,
            taskId: input.taskId ?? null,
            cause: input.cause,
            note: input.note ?? null,
            evidenceId: input.evidenceId ?? null,
            status: input.ongoing ? "open" : "closed",
            startedOn: input.localDate,
            closedOn: input.ongoing ? null : input.localDate,
          })
          .returning();
        holdupId = thread.id;
      }
      // A hold-up logged after the day's diary already exists (even locked)
      // still belongs to that day's record.
      const dayEntry = await ctx.db.query.diaryEntries.findFirst({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          eq(diaryEntries.authorId, ctx.userId),
          eq(diaryEntries.entryDate, input.localDate)
        ),
        columns: { id: true },
      });
      const [day] = await ctx.db
        .insert(diaryHoldupDays)
        .values({
          holdupId,
          projectId: input.projectId,
          reportedBy: ctx.userId,
          occurredOn: input.localDate,
          hoursLost: input.hoursLost,
          note: input.note ?? null,
          loggedAt: input.loggedAt,
          entryId: dayEntry?.id ?? null,
        })
        .onConflictDoUpdate({
          target: [diaryHoldupDays.holdupId, diaryHoldupDays.occurredOn],
          set: { hoursLost: input.hoursLost, note: input.note ?? null },
        })
        .returning();
      if (input.holdupId && !input.ongoing) {
        await ctx.db
          .update(diaryHoldups)
          .set({ status: "closed", closedOn: input.localDate })
          .where(eq(diaryHoldups.id, input.holdupId));
      }
      await ctx.db.insert(diaryEvents).values({
        holdupId,
        projectId: input.projectId,
        actorId: ctx.userId,
        kind: input.holdupId ? "holdup_updated" : "holdup_logged",
        payload: { cause: input.cause, hoursLost: input.hoursLost, occurredOn: input.localDate },
        clientAt: input.loggedAt,
      });
      writeAuditLogAsync(ctx.db, {
        projectId: input.projectId,
        userId: ctx.userId,
        action: "update",
        entityType: "diary_holdup",
        entityId: holdupId,
        metadata: { event: "holdup_logged", cause: input.cause, hoursLost: input.hoursLost },
      });
      return { holdupId, dayId: day.id };
    }),

  closeHoldup: protectedProcedure
    .input(z.object({ holdupId: z.string().uuid(), closedOn: dateStr }))
    .mutation(async ({ ctx, input }) => {
      const thread = await ctx.db.query.diaryHoldups.findFirst({
        where: eq(diaryHoldups.id, input.holdupId),
        columns: { id: true, projectId: true, status: true },
      });
      if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Hold-up not found" });
      await assertProjectAccess(ctx.db, thread.projectId, ctx.orgId, ctx.userId);
      await ctx.db
        .update(diaryHoldups)
        .set({ status: "closed", closedOn: input.closedOn })
        .where(eq(diaryHoldups.id, input.holdupId));
      await ctx.db.insert(diaryEvents).values({
        holdupId: input.holdupId,
        projectId: thread.projectId,
        actorId: ctx.userId,
        kind: "holdup_closed",
        payload: { closedOn: input.closedOn },
      });
      return { ok: true };
    }),

  /** Append-only amendment on a locked entry (author or PM). */
  amend: protectedProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        changes: z
          .array(
            z.object({
              field: z.string().min(1).max(60),
              previous: z.string().max(4000).nullable(),
              next: z.string().max(4000).nullable(),
            })
          )
          .min(1)
          .max(20),
        note: z.string().trim().max(1000).optional(),
        // Scalar updates applied to the row (current state); history in events.
        apply: amendApplySchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.query.diaryEntries.findFirst({
        where: eq(diaryEntries.id, input.entryId),
        columns: { id: true, projectId: true, authorId: true, status: true },
      });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      await assertProjectAccess(ctx.db, entry.projectId, ctx.orgId, ctx.userId);
      if (entry.status === "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Draft entries are edited directly — amendments are for locked days.",
        });
      }
      if (entry.authorId !== ctx.userId && ctx.dbUser?.role !== "admin") {
        await assertPmView(ctx.db, entry.projectId, ctx.userId, ctx.dbUser?.role ?? "member");
      }
      const now = new Date();
      if (input.apply) {
        const partial: Record<string, unknown> = {};
        const p = input.apply;
        if (p.workNote !== undefined) partial.workNote = p.workNote ?? null;
        if (p.visitorsCount !== undefined) partial.visitorsCount = p.visitorsCount;
        if (p.inspectionsCount !== undefined) partial.inspectionsCount = p.inspectionsCount;
        if (p.toolboxTalk !== undefined) partial.toolboxTalk = p.toolboxTalk;
        if (p.toolboxTopic !== undefined) partial.toolboxTopic = p.toolboxTopic ?? null;
        if (p.incidentsCount !== undefined) partial.incidentsCount = p.incidentsCount;
        if (p.safetyNote !== undefined) partial.safetyNote = p.safetyNote ?? null;
        if (Object.keys(partial).length > 0) {
          await ctx.db
            .update(diaryEntries)
            .set({ ...partial, amendedAt: now, updatedAt: now })
            .where(eq(diaryEntries.id, entry.id));
        } else {
          await ctx.db
            .update(diaryEntries)
            .set({ amendedAt: now, updatedAt: now })
            .where(eq(diaryEntries.id, entry.id));
        }
      } else {
        await ctx.db
          .update(diaryEntries)
          .set({ amendedAt: now, updatedAt: now })
          .where(eq(diaryEntries.id, entry.id));
      }
      await ctx.db.insert(diaryEvents).values(
        input.changes.map((c) => ({
          entryId: entry.id,
          projectId: entry.projectId,
          actorId: ctx.userId,
          kind: "amended" as const,
          payload: { field: c.field, previous: c.previous, next: c.next, note: input.note },
        }))
      );
      writeAuditLogAsync(ctx.db, {
        projectId: entry.projectId,
        userId: ctx.userId,
        action: "update",
        entityType: "diary_entry",
        entityId: entry.id,
        metadata: { event: "diary_amend", fields: input.changes.map((c) => c.field) },
      });
      return { ok: true };
    }),

  /** PM matrix: members × working days with derived states. */
  matrix: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), from: dateStr, to: dateStr }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      await assertPmView(ctx.db, input.projectId, ctx.userId, ctx.dbUser?.role ?? "member");
      const project = await loadProject(ctx.db, input.projectId);
      const workingDays = projectWorkingDays(project);
      const floor = projectFloorDate(project);
      const days = workingDatesBetween(input.from, input.to, workingDays).filter(
        (d) => d >= floor
      );

      const entries = await ctx.db.query.diaryEntries.findMany({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          gte(diaryEntries.entryDate, input.from),
          lte(diaryEntries.entryDate, input.to)
        ),
        columns: {
          id: true,
          authorId: true,
          entryDate: true,
          status: true,
          late: true,
          amendedAt: true,
        },
      });
      const members = await ctx.db.query.projectMembers.findMany({
        where: eq(projectMembers.projectId, input.projectId),
        with: { user: { columns: { id: true, name: true } } },
      });
      const authorIds = new Set([
        ...members.map((m) => m.userId),
        ...entries.map((e) => e.authorId),
      ]);
      const extraAuthors = [...authorIds].filter(
        (id) => !members.some((m) => m.userId === id)
      );
      const extraUsers = extraAuthors.length
        ? await ctx.db.query.users.findMany({
            where: inArray(users.id, extraAuthors),
            columns: { id: true, name: true },
          })
        : [];
      const authors = [
        ...members.map((m) => ({ id: m.userId, name: m.user.name, role: m.role })),
        ...extraUsers.map((u) => ({ id: u.id, name: u.name, role: "member" })),
      ];
      const byAuthorDate = new Map<string, (typeof entries)[number]>();
      for (const e of entries) byAuthorDate.set(`${e.authorId}|${e.entryDate}`, e);

      return {
        days,
        timezone: project.timezone,
        authors: authors.map((a) => ({
          ...a,
          cells: days.map((d) => {
            const e = byAuthorDate.get(`${a.id}|${d}`) ?? null;
            return {
              date: d,
              status: effectiveDiaryStatus(e, d, project.timezone, workingDays),
              amended: Boolean(e?.amendedAt),
              entryId: e?.id ?? null,
            };
          }),
        })),
      };
    }),

  /** PM delay ledger: hours by cause + open threads. */
  ledger: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      await assertPmView(ctx.db, input.projectId, ctx.userId, ctx.dbUser?.role ?? "member");
      const threads = await ctx.db.query.diaryHoldups.findMany({
        where: eq(diaryHoldups.projectId, input.projectId),
        with: {
          days: true,
          task: { columns: { id: true, name: true } },
          author: { columns: { id: true, name: true } },
        },
        orderBy: [desc(diaryHoldups.startedOn)],
      });
      const hoursByCause: Record<string, number> = {};
      for (const t of threads) {
        const total = t.days.reduce((s, d) => s + d.hoursLost, 0);
        hoursByCause[t.cause] = (hoursByCause[t.cause] ?? 0) + total;
      }
      return {
        hoursByCause,
        totalHours: Object.values(hoursByCause).reduce((s, v) => s + v, 0),
        threads: threads.map((t) => ({
          id: t.id,
          cause: t.cause,
          note: t.note,
          status: t.status,
          startedOn: t.startedOn,
          closedOn: t.closedOn,
          taskName: t.task?.name ?? null,
          authorName: t.author.name,
          dayCount: t.days.length,
          totalHours: t.days.reduce((s, d) => s + d.hoursLost, 0),
        })),
      };
    }),

  /** Full entry detail for the PM matrix drawer (PM roles or the author). */
  entryDetail: protectedProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.query.diaryEntries.findFirst({
        where: eq(diaryEntries.id, input.entryId),
        with: {
          workLines: { orderBy: (t, { asc }) => [asc(t.sortOrder)] },
          resources: true,
          author: { columns: { id: true, name: true } },
        },
      });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      await assertProjectAccess(ctx.db, entry.projectId, ctx.orgId, ctx.userId);
      if (entry.authorId !== ctx.userId) {
        await assertPmView(ctx.db, entry.projectId, ctx.userId, ctx.dbUser?.role ?? "member");
      }
      const [amendments, holdupDays] = await Promise.all([
        ctx.db.query.diaryEvents.findMany({
          where: and(eq(diaryEvents.entryId, entry.id), eq(diaryEvents.kind, "amended")),
          orderBy: [desc(diaryEvents.createdAt)],
        }),
        ctx.db.query.diaryHoldupDays.findMany({
          where: eq(diaryHoldupDays.entryId, entry.id),
          with: { holdup: { columns: { cause: true, note: true, status: true } } },
        }),
      ]);
      return {
        entry,
        holdupDays: holdupDays.map((d) => ({
          id: d.id,
          cause: d.holdup.cause,
          note: d.note ?? d.holdup.note,
          hoursLost: d.hoursLost,
          loggedAt: d.loggedAt,
          receivedAt: d.receivedAt,
        })),
        amendments: amendments.map((a) => ({
          id: a.id,
          field: (a.payload as { field?: string }).field ?? "note",
          previous: (a.payload as { previous?: string | null }).previous ?? null,
          next: (a.payload as { next?: string | null }).next ?? null,
          note: (a.payload as { note?: string }).note ?? null,
          at: a.createdAt,
        })),
      };
    }),

  /** Aggregates for one date range — powers the weekly roll-up strip. */
  weekSummary: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), from: dateStr, to: dateStr }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      await assertPmView(ctx.db, input.projectId, ctx.userId, ctx.dbUser?.role ?? "member");
      const project = await loadProject(ctx.db, input.projectId);
      const workingDays = projectWorkingDays(project);
      const days = workingDatesBetween(input.from, input.to, workingDays);

      const entries = await ctx.db.query.diaryEntries.findMany({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          gte(diaryEntries.entryDate, input.from),
          lte(diaryEntries.entryDate, input.to)
        ),
        with: { resources: true, workLines: { columns: { taskId: true } } },
      });
      const holdupDays = await ctx.db.query.diaryHoldupDays.findMany({
        where: and(
          eq(diaryHoldupDays.projectId, input.projectId),
          gte(diaryHoldupDays.occurredOn, input.from),
          lte(diaryHoldupDays.occurredOn, input.to)
        ),
        with: { holdup: { columns: { cause: true } } },
      });

      const locked = entries.filter((e) => e.status === "locked");
      const labourByDay = new Map<string, number>();
      for (const e of locked) {
        const labour = e.resources
          .filter((r) => r.kind === "labour")
          .reduce((s, r) => s + r.qty, 0);
        labourByDay.set(e.entryDate, (labourByDay.get(e.entryDate) ?? 0) + labour);
      }
      const labourVals = [...labourByDay.values()];
      const hoursByCause: Record<string, number> = {};
      for (const d of holdupDays) {
        hoursByCause[d.holdup.cause] = (hoursByCause[d.holdup.cause] ?? 0) + d.hoursLost;
      }
      const tasksTouched = new Set(
        locked.flatMap((e) => e.workLines.map((w) => w.taskId).filter(Boolean))
      ).size;
      const daysWithRecord = new Set(locked.map((e) => e.entryDate)).size;

      return {
        workingDayCount: days.length,
        daysWithRecord,
        labourAvg: labourVals.length
          ? Math.round((labourVals.reduce((s, v) => s + v, 0) / labourVals.length) * 10) / 10
          : 0,
        labourPeak: labourVals.length ? Math.max(...labourVals) : 0,
        hoursLostTotal: Object.values(hoursByCause).reduce((s, v) => s + v, 0),
        hoursByCause,
        incidents: locked.reduce((s, e) => s + e.incidentsCount, 0),
        toolboxTalks: locked.filter((e) => e.toolboxTalk).length,
        inspections: locked.reduce((s, e) => s + e.inspectionsCount, 0),
        tasksTouched,
        lateEntries: locked.filter((e) => e.late).length,
        amendedEntries: entries.filter((e) => e.amendedAt).length,
      };
    }),

  /** My streak + recent days, for the phone DiaryCard. */
  myWeek: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), localDate: dateStr }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const project = await loadProject(ctx.db, input.projectId);
      const workingDays = projectWorkingDays(project);
      const from = new Date(`${input.localDate}T12:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 60);
      const entries = await ctx.db.query.diaryEntries.findMany({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          eq(diaryEntries.authorId, ctx.userId),
          gte(diaryEntries.entryDate, from.toISOString().slice(0, 10)),
          lte(diaryEntries.entryDate, input.localDate)
        ),
        columns: { entryDate: true, status: true, late: true },
      });
      const locked = new Set(
        entries.filter((e) => e.status === "locked").map((e) => e.entryDate)
      );
      const floor = projectFloorDate(project);
      const last7: { date: string; status: string }[] = [];
      const cur = new Date(`${input.localDate}T12:00:00Z`);
      for (let i = 0; i < 7; i++) {
        const d = cur.toISOString().slice(0, 10);
        const e = entries.find((x) => x.entryDate === d) ?? null;
        last7.unshift({
          date: d,
          status:
            d < floor
              ? "none"
              : effectiveDiaryStatus(e, d, project.timezone, workingDays),
        });
        cur.setUTCDate(cur.getUTCDate() - 1);
      }
      return {
        streak: computeStreak(locked, input.localDate, workingDays),
        last7,
        todayStatus: last7[last7.length - 1]?.status ?? "pending",
      };
    }),
});
