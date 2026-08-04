import { XMLParser } from "fast-xml-parser";

/**
 * Programme XML parsing (MS Project / Primavera P6). Pure and
 * browser-safe: the import dialog parses files client-side so large
 * real-world exports (5-20MB) never have to travel to the server —
 * only the extracted task list does.
 */

export interface ParsedTask {
  sourceRef: string;
  name: string;
  parentSourceRef: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progressPct: number;
  sortOrder: number;
  isMilestone?: boolean;
}

export type ProgrammeFormat = "msproject" | "p6" | "xlsx" | "pdf";

export interface ParseResult {
  format: ProgrammeFormat;
  tasks: ParsedTask[];
}

function toDateString(val: unknown): string | null {
  if (!val) return null;
  const str = String(val);
  // Handle ISO datetime or date-only
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function clampPct(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 100);
}

/**
 * Real-world programmes often express completion through actual dates
 * rather than percent-complete — a task with an ActualFinish is done even
 * when its PercentComplete still reads 0. Reconcile the two so imports
 * reflect the programme the way its author reads it.
 */
function reconcileProgress(
  pct: number,
  actualStart: string | null,
  actualEnd: string | null
): number {
  if (actualEnd) return 100;
  return pct;
}

/**
 * Parse MS Project XML format.
 * Structure: <Project><Tasks><Task>...</Task></Tasks></Project>
 */
export function parseMSProjectXML(xml: string): ParsedTask[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    isArray: (name) => name === "Task",
  });
  const doc = parser.parse(xml);
  const project = doc.Project;
  if (!project?.Tasks?.Task) {
    throw new Error("No tasks found in MS Project XML");
  }

  const rawTasks = toArray(project.Tasks.Task);
  const result: ParsedTask[] = [];

  // Track parent stack by outline level
  const parentStack: { uid: string; level: number }[] = [];

  for (let i = 0; i < rawTasks.length; i++) {
    const t = rawTasks[i];
    const uid = String(t.UID ?? i);
    const name = String(t.Name ?? "Unnamed Task").trim() || "Unnamed Task";
    const level = Number(t.OutlineLevel ?? 0);
    const pct = clampPct(t.PercentComplete);
    const actualStart = toDateString(t.ActualStart);
    const actualEnd = toDateString(t.ActualFinish);

    // Skip the project summary task (OutlineLevel 0)
    if (level === 0) continue;

    // Find parent: pop stack until we find a task at level - 1
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
      parentStack.pop();
    }
    const parentRef = parentStack.length > 0 ? parentStack[parentStack.length - 1].uid : null;

    parentStack.push({ uid, level });

    // MS Project marks milestones explicitly (<Milestone>1</Milestone>,
    // sometimes serialised as "true").
    const milestoneVal = String(t.Milestone ?? "").toLowerCase();
    const isMilestone = milestoneVal === "1" || milestoneVal === "true";

    result.push({
      sourceRef: uid,
      name,
      parentSourceRef: parentRef,
      plannedStart: toDateString(t.Start),
      plannedEnd: toDateString(t.Finish),
      actualStart,
      actualEnd,
      progressPct: reconcileProgress(pct, actualStart, actualEnd),
      sortOrder: result.length,
      isMilestone,
    });
  }

  return result;
}

/**
 * Parse Primavera P6 XML format.
 * Look for <Activity> elements under various possible root structures.
 */
export function parseP6XML(xml: string): ParsedTask[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    isArray: (name) => name === "Activity" || name === "WBS",
  });
  const doc = parser.parse(xml);

  // Navigate to activities - P6 XML has varying structures
  let activities: Record<string, unknown>[] = [];

  // Try common P6 structures
  const root = doc.APIBusinessObjects ?? doc.Project ?? doc;
  if (root.Activity) {
    activities = toArray(root.Activity);
  } else if (root.ProjectData?.Activity) {
    activities = toArray(root.ProjectData.Activity);
  } else if (root.Project?.Activity) {
    activities = toArray(root.Project.Activity);
  }

  if (activities.length === 0) {
    throw new Error("No activities found in P6 XML");
  }

  return activities.map((a, i) => {
    const actualStart = toDateString(a.ActualStartDate ?? a.ActualStart);
    const actualEnd = toDateString(a.ActualFinishDate ?? a.ActualFinish);
    const pct = clampPct(a.PercentComplete ?? a.PhysicalPercentComplete);
    // P6 milestone activity types: "Start Milestone" / "Finish Milestone"
    // (XER exports abbreviate to TT_Mile / TT_FinMile).
    const typeStr = String(a.Type ?? a.ActivityType ?? "").toLowerCase();
    const isMilestone = typeStr.includes("milestone") || typeStr.includes("mile");
    return {
      sourceRef: String(a.Id ?? a.ObjectId ?? a.ActivityId ?? i),
      name: String(a.Name ?? a.ActivityName ?? "Unnamed Activity").trim() || "Unnamed Activity",
      parentSourceRef: a.ParentObjectId ? String(a.ParentObjectId) : null,
      plannedStart: toDateString(a.PlannedStartDate ?? a.StartDate),
      plannedEnd: toDateString(a.PlannedFinishDate ?? a.FinishDate),
      actualStart,
      actualEnd,
      progressPct: reconcileProgress(pct, actualStart, actualEnd),
      sortOrder: i,
      isMilestone,
    };
  });
}

/**
 * Auto-detect format and parse.
 */
export function detectAndParse(xml: string): ParseResult {
  // Quick heuristic: check for MS Project markers
  if (xml.includes("<Project") && xml.includes("<Tasks>")) {
    return { format: "msproject", tasks: parseMSProjectXML(xml) };
  }

  if (xml.includes("<Activity") || xml.includes("Primavera")) {
    return { format: "p6", tasks: parseP6XML(xml) };
  }

  // Try MS Project first as fallback
  try {
    const tasks = parseMSProjectXML(xml);
    if (tasks.length > 0) return { format: "msproject", tasks };
  } catch {
    // ignore
  }

  try {
    const tasks = parseP6XML(xml);
    if (tasks.length > 0) return { format: "p6", tasks };
  } catch {
    // ignore
  }

  throw new Error(
    "Unrecognized XML format. Please upload an MS Project XML or Primavera P6 XML file."
  );
}
