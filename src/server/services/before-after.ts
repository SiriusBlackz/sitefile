import { eq, and, gte, lte, asc } from "drizzle-orm";
import { evidence, gpsZones } from "@/server/db/schema";
import { pointInPolygon } from "@/lib/geo";
import type { db as dbType } from "@/server/db";
import { getReadUrl } from "./storage";

type DB = typeof dbType;

export interface BeforeAfterPair {
  taskId: string;
  taskName: string;
  zoneName: string | null;
  before: {
    publicUrl: string;
    capturedAt: string;
    filename: string | null;
  };
  after: {
    publicUrl: string;
    capturedAt: string;
    filename: string | null;
  };
}

/**
 * Auto-match earliest and latest evidence per task within the same GPS zone.
 * Returns pairs suitable for the before/after report template.
 */
export async function generateBeforeAfterPairs(
  db: DB,
  projectId: string,
  periodStart: string,
  periodEnd: string
): Promise<BeforeAfterPair[]> {
  // Get all zones for this project
  const zones = await db.query.gpsZones.findMany({
    where: eq(gpsZones.projectId, projectId),
  });

  // Get evidence within the reporting period with linked tasks
  const periodStartDate = new Date(periodStart + "T00:00:00Z");
  const periodEndDate = new Date(periodEnd + "T23:59:59.999Z");

  const allEvidence = await db.query.evidence.findMany({
    where: and(
      eq(evidence.projectId, projectId),
      gte(evidence.capturedAt, periodStartDate),
      lte(evidence.capturedAt, periodEndDate)
    ),
    orderBy: [asc(evidence.capturedAt)],
    with: {
      links: {
        with: {
          task: { columns: { id: true, name: true } },
        },
      },
    },
  });

  // Group evidence by task and zone
  // Key: `${taskId}:${zoneId|"none"}`
  const groups = new Map<
    string,
    {
      taskId: string;
      taskName: string;
      zoneName: string | null;
      items: {
        capturedAt: Date;
        storageKey: string;
        thumbnailKey: string | null;
        filename: string | null;
      }[];
    }
  >();

  for (const ev of allEvidence) {
    if (!ev.capturedAt) continue;

    // Determine which zone this evidence falls in
    let matchedZone: { id: string; name: string } | null = null;
    if (ev.latitude != null && ev.longitude != null) {
      for (const zone of zones) {
        const polygon = zone.polygon as { type: string; coordinates: number[][][] };
        if (pointInPolygon([ev.longitude, ev.latitude], polygon.coordinates)) {
          matchedZone = { id: zone.id, name: zone.name };
          break;
        }
      }
    }

    // For each linked task, add to the group
    for (const link of ev.links) {
      const zoneKey = matchedZone?.id ?? "none";
      const groupKey = `${link.task.id}:${zoneKey}`;

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          taskId: link.task.id,
          taskName: link.task.name,
          zoneName: matchedZone?.name ?? null,
          items: [],
        };
        groups.set(groupKey, group);
      }

      group.items.push({
        capturedAt: ev.capturedAt,
        storageKey: ev.storageKey,
        thumbnailKey: ev.thumbnailKey,
        filename: ev.originalFilename,
      });
    }
  }

  // For each group, pick earliest and latest (must be different items)
  const pairs: BeforeAfterPair[] = [];
  for (const group of groups.values()) {
    if (group.items.length < 2) continue;

    // Sort by capturedAt
    group.items.sort(
      (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime()
    );

    const earliest = group.items[0];
    const latest = group.items[group.items.length - 1];

    // Don't create a pair if they're the same item
    if (earliest.storageKey === latest.storageKey) continue;

    // Presigned URLs (Puppeteer fetches at render time); thumbnails when
    // available — full-size originals were the main PDF-bloat source.
    const beforeUrl = await getReadUrl(earliest.thumbnailKey ?? earliest.storageKey);
    const afterUrl = await getReadUrl(latest.thumbnailKey ?? latest.storageKey);
    if (!beforeUrl || !afterUrl) continue;

    pairs.push({
      taskId: group.taskId,
      taskName: group.taskName,
      zoneName: group.zoneName,
      before: {
        publicUrl: beforeUrl,
        capturedAt: earliest.capturedAt.toISOString(),
        filename: earliest.filename,
      },
      after: {
        publicUrl: afterUrl,
        capturedAt: latest.capturedAt.toISOString(),
        filename: latest.filename,
      },
    });
  }

  // Sort by task name for consistent ordering
  pairs.sort((a, b) => a.taskName.localeCompare(b.taskName));

  return pairs;
}
