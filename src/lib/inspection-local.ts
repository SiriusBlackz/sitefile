/**
 * Phone-side memory for inspection projects: the chosen visit stage and
 * the project facts a cold, offline open of the Record screen needs
 * (react-query's cache is memory-only). All reads are try/catch —
 * storage can be blocked or empty and the screens must still render.
 */
export type Stage = "initial_walkthrough" | "interim_reinspection" | "end_of_defects_period";

const stageKey = (projectId: string) => `inspect:stage:${projectId}`;
const projectKey = (projectId: string) => `inspect:project:${projectId}`;

export function readStage(projectId: string): Stage {
  try {
    const v = localStorage.getItem(stageKey(projectId));
    if (v === "initial_walkthrough" || v === "interim_reinspection" || v === "end_of_defects_period") return v;
  } catch {}
  return "end_of_defects_period";
}
export function writeStage(projectId: string, stage: Stage) {
  try { localStorage.setItem(stageKey(projectId), stage); } catch {}
}

export interface CachedProject { locationScheme: string | null; name: string }
export function readCachedProject(projectId: string): CachedProject | null {
  try {
    const raw = localStorage.getItem(projectKey(projectId));
    return raw ? (JSON.parse(raw) as CachedProject) : null;
  } catch { return null; }
}
export function writeCachedProject(projectId: string, p: CachedProject) {
  try { localStorage.setItem(projectKey(projectId), JSON.stringify(p)); } catch {}
}
