import { eq, desc, gte } from "drizzle-orm";
import { pointInPolygon } from "@/lib/geo";
import {
  tasks,
  gpsZones,
  evidenceLinks,
} from "@/server/db/schema";
import type { db as dbType } from "@/server/db";

type DB = typeof dbType;

interface EvidenceInput {
  latitude: number | null;
  longitude: number | null;
  capturedAt: Date | null;
  projectId: string;
}

export interface TaskSuggestion {
  taskId: string;
  taskName: string;
  confidence: number;
  reasons: string[];
}

// Signal weights (points out of 100). GPS-zone containment is the
// strongest signal, a date-window match is medium, recency is weak.
const ZONE_POINTS = 60;
const TIME_ACTUAL_POINTS = 45;
const TIME_PLANNED_POINTS = 30;
const TIME_STARTED_POINTS = 15;
const RECENCY_POINTS = { week: 15, fortnight: 10, month: 5 };

// Caps: confidence must reflect the strongest signal present, so weak
// signals alone can never produce a confident-looking suggestion.
const MAX_CONFIDENCE = 0.9; // heuristics are never certain — no 100%s
const NO_ZONE_CAP = 0.55; // time/recency only
const RECENCY_ONLY_CAP = 0.25;
const MIN_CONFIDENCE = 0.3;

interface TaskScore {
  name: string;
  reasons: string[];
  zonePoints: number;
  timePoints: number;
  recencyPoints: number;
}

export async function suggestTasks(
  db: DB,
  evidence: EvidenceInput
): Promise<TaskSuggestion[]> {
  const scores = new Map<string, TaskScore>();

  function entryFor(taskId: string, taskName: string): TaskScore {
    const existing = scores.get(taskId) ?? {
      name: taskName,
      reasons: [],
      zonePoints: 0,
      timePoints: 0,
      recencyPoints: 0,
    };
    scores.set(taskId, existing);
    return existing;
  }

  const projectTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, evidence.projectId),
    columns: {
      id: true,
      name: true,
      parentTaskId: true,
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
    },
  });
  const parentIds = new Set(
    projectTasks.map((t) => t.parentTaskId).filter((id): id is string => id != null)
  );

  // 1. GPS-zone containment — strong signal
  if (evidence.latitude != null && evidence.longitude != null) {
    const zones = await db.query.gpsZones.findMany({
      where: eq(gpsZones.projectId, evidence.projectId),
      with: {
        defaultTask: { columns: { id: true, name: true } },
      },
    });

    const point: [number, number] = [evidence.longitude, evidence.latitude];

    for (const zone of zones) {
      const polygon = zone.polygon as { type: string; coordinates: number[][][] };
      if (pointInPolygon(point, polygon.coordinates) && zone.defaultTask) {
        const entry = entryFor(zone.defaultTask.id, zone.defaultTask.name);
        entry.zonePoints = Math.max(entry.zonePoints, ZONE_POINTS);
        entry.reasons.push(`Photo taken inside the ${zone.name} zone`);
      }
    }
  }

  // 2. Date-window match — medium signal. Parent/phase tasks are skipped:
  // their windows span everything beneath them, so they'd match almost
  // any photo without telling the user anything useful.
  if (evidence.capturedAt) {
    const capturedDate = evidence.capturedAt.toISOString().split("T")[0];

    for (const task of projectTasks) {
      if (parentIds.has(task.id)) continue;
      // Prefer actual dates over planned dates
      const startDate = task.actualStart ?? task.plannedStart;
      const endDate = task.actualEnd ?? task.plannedEnd;
      const usesActual = task.actualStart != null || task.actualEnd != null;

      if (startDate && endDate) {
        if (capturedDate >= startDate && capturedDate <= endDate) {
          const entry = entryFor(task.id, task.name);
          entry.timePoints = usesActual ? TIME_ACTUAL_POINTS : TIME_PLANNED_POINTS;
          entry.reasons.push(
            usesActual
              ? "Taken while this task was underway on site"
              : "Taken during this task's planned dates"
          );
        }
      } else if (startDate && capturedDate >= startDate) {
        const entry = entryFor(task.id, task.name);
        entry.timePoints = TIME_STARTED_POINTS;
        entry.reasons.push("Task had started by the capture date");
      }
    }
  }

  // 3. Recency — weak signal (evidence recently linked to the task)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentLinks = await db.query.evidenceLinks.findMany({
    where: gte(evidenceLinks.createdAt, thirtyDaysAgo),
    with: {
      task: { columns: { id: true, name: true, projectId: true } },
    },
    orderBy: [desc(evidenceLinks.createdAt)],
  });

  // Group by task, find most recent link per task
  const taskLastLinked = new Map<string, { name: string; lastLinked: Date }>();
  for (const link of recentLinks) {
    if (link.task.projectId !== evidence.projectId) continue;
    if (!taskLastLinked.has(link.task.id)) {
      taskLastLinked.set(link.task.id, {
        name: link.task.name,
        lastLinked: link.createdAt!,
      });
    }
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  for (const [taskId, { name, lastLinked }] of taskLastLinked) {
    const entry = entryFor(taskId, name);
    if (lastLinked >= sevenDaysAgo) {
      entry.recencyPoints = RECENCY_POINTS.week;
      entry.reasons.push("Recently worked on — photos linked in the last week");
    } else if (lastLinked >= fourteenDaysAgo) {
      entry.recencyPoints = RECENCY_POINTS.fortnight;
      entry.reasons.push("Recently worked on — photos linked in the last two weeks");
    } else {
      entry.recencyPoints = RECENCY_POINTS.month;
      entry.reasons.push("Recently worked on — photos linked in the last month");
    }
  }

  // Combine: the strongest signal sets the baseline; weaker signals only
  // nudge it up (quarter weight) so stacked weak signals can't imitate a
  // strong one. Cap by the best signal class present.
  const suggestions: TaskSuggestion[] = [];
  for (const [taskId, data] of scores) {
    const points = [data.zonePoints, data.timePoints, data.recencyPoints];
    const strongest = Math.max(...points);
    if (strongest === 0) continue;
    const rest = points.reduce((sum, p) => sum + p, 0) - strongest;
    let confidence = Math.min((strongest + 0.25 * rest) / 100, MAX_CONFIDENCE);
    if (data.zonePoints === 0) {
      confidence = Math.min(
        confidence,
        data.timePoints === 0 ? RECENCY_ONLY_CAP : NO_ZONE_CAP
      );
    }
    if (confidence >= MIN_CONFIDENCE) {
      suggestions.push({
        taskId,
        taskName: data.name,
        confidence,
        reasons: data.reasons,
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, 5);
}
