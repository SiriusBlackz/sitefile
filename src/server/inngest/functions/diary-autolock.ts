import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db";
import {
  projects,
  projectMembers,
  diaryEntries,
  diaryEvents,
} from "@/server/db/schema";
import {
  localDateString,
  isWorkingDay,
  workingDatesBetween,
  DEFAULT_WORKING_DAYS,
  type WorkingDays,
} from "@/lib/dates";

/**
 * Hourly auto-lock sweep — the SECONDARY lock mechanism.
 *
 * The primary is derive-at-read (`effectiveDiaryStatus` in src/lib/dates.ts):
 * every read path already treats a past working day with no locked entry as
 * "not_filled", so previews and branches behave correctly with no cron at
 * all. This sweep only MATERIALISES that state once a project's local
 * wall-clock has passed 23:59 — making "absence is a record" durable and
 * queryable for reports and the PM ledger:
 *   - draft entries for past days lock as-is (status stays the record;
 *     an auto_locked event marks how the lock happened),
 *   - working-day members with no entry at all get a `not_filled` row.
 *
 * Idempotent: upserts guarded by the (project, author, entry_date) unique
 * key; overlap with derive-at-read is harmless. Runs only in deployments
 * that serve the Inngest route (i.e. activates on merge to main).
 */
/** The sweep itself — exported so QA/support can drive it directly. */
export async function runDiaryAutolockSweep(
  now: Date = new Date(),
  onlyProjectId?: string
) {
  const activeProjects = await db.query.projects.findMany({
    where: onlyProjectId
      ? and(eq(projects.status, "active"), eq(projects.id, onlyProjectId))
      : eq(projects.status, "active"),
    columns: {
      id: true,
      timezone: true,
      workingDays: true,
      startDate: true,
      createdAt: true,
    },
  });

  let locked = 0;
  let materialised = 0;

  for (const project of activeProjects) {
    // Adoption gate: "absence is a record" only once the diary is in use
    // on this project — otherwise merging the feature would backfill
    // not_filled rows onto every legacy project overnight.
    const anyDiary = await db.query.diaryEntries.findFirst({
      where: eq(diaryEntries.projectId, project.id),
      columns: { id: true },
    });
    if (!anyDiary) continue;

    const tz = project.timezone || "Europe/London";
    const today = localDateString(now, tz);
    const workingDays: WorkingDays =
      Array.isArray(project.workingDays) &&
      project.workingDays.every((n) => typeof n === "number")
        ? (project.workingDays as WorkingDays)
        : DEFAULT_WORKING_DAYS;

    // 1. Lock stale drafts for days that have ended (site-local).
    const staleDrafts = await db.query.diaryEntries.findMany({
      where: and(
        eq(diaryEntries.projectId, project.id),
        eq(diaryEntries.status, "draft"),
        lt(diaryEntries.entryDate, today)
      ),
      columns: { id: true, entryDate: true },
    });
    for (const draft of staleDrafts) {
      await db
        .update(diaryEntries)
        .set({ status: "locked", lockedAt: now, updatedAt: now })
        .where(and(eq(diaryEntries.id, draft.id), eq(diaryEntries.status, "draft")));
      await db.insert(diaryEvents).values({
        entryId: draft.id,
        projectId: project.id,
        kind: "auto_locked",
        payload: { reason: "day_ended_draft", entryDate: draft.entryDate },
      });
      locked++;
    }

    // 2. Materialise not_filled rows for the last 7 ended days.
    //    Bounded window: derive-at-read still covers anything older.
    const windowStart = new Date(now.getTime() - 8 * 86_400_000);
    const from = localDateString(windowStart, tz);
    const yesterdayEnd = workingDatesBetween(from, today, workingDays).filter(
      (d) => d < today
    );
    if (yesterdayEnd.length === 0) continue;

    const members = await db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, project.id),
      columns: { userId: true },
      with: { user: { columns: { clerkId: true, createdAt: true } } },
    });
    // Placeholder (invited:*) members haven't signed up — no diary owed.
    const activeMembers = members.filter(
      (m) => !m.user.clerkId.startsWith("invited:")
    );
    if (activeMembers.length === 0) continue;

    const existing = await db.query.diaryEntries.findMany({
      where: and(
        eq(diaryEntries.projectId, project.id),
        gte(diaryEntries.entryDate, yesterdayEnd[0]),
        inArray(
          diaryEntries.authorId,
          activeMembers.map((m) => m.userId)
        )
      ),
      columns: { authorId: true, entryDate: true },
    });
    const have = new Set(existing.map((e) => `${e.authorId}|${e.entryDate}`));

    const projectFloor =
      project.startDate ??
      (project.createdAt
        ? localDateString(project.createdAt, tz)
        : yesterdayEnd[0]);

    for (const member of activeMembers) {
      // Mid-project joiners only owe diaries from when they joined
      // (approximated by their user row's creation).
      const memberFloor = member.user.createdAt
        ? localDateString(member.user.createdAt, tz)
        : projectFloor;
      const floor = memberFloor > projectFloor ? memberFloor : projectFloor;
      for (const day of yesterdayEnd) {
        if (day < floor) continue;
        if (!isWorkingDay(day, workingDays)) continue;
        if (have.has(`${member.userId}|${day}`)) continue;
        const [row] = await db
          .insert(diaryEntries)
          .values({
            projectId: project.id,
            authorId: member.userId,
            entryDate: day,
            status: "not_filled",
            lockedAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (row) {
          await db.insert(diaryEvents).values({
            entryId: row.id,
            projectId: project.id,
            kind: "auto_locked",
            payload: { reason: "not_filled", entryDate: day },
          });
          materialised++;
        }
      }
    }
  }
  return { projects: activeProjects.length, locked, materialised };
}

export const diaryAutolock = inngest.createFunction(
  {
    id: "diary-autolock",
    retries: 2,
    triggers: [{ cron: "5 * * * *" }],
  },
  async ({ step }) => {
    return step.run("sweep", () => runDiaryAutolockSweep());
  }
);
