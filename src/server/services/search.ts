import { sql } from "drizzle-orm";
import type { db as dbType } from "@/server/db";
import { HOLDUP_CAUSE_LABELS } from "@/lib/holdup-causes";

type DB = typeof dbType;

export type SearchKind =
  | "diary_work"
  | "diary_note"
  | "holdup"
  | "photo"
  | "report"
  | "task";

export interface SearchHit {
  kind: SearchKind;
  /** ISO date (yyyy-mm-dd) the record is about — the day it happened. */
  date: string | null;
  title: string;
  /** Plain text with ⟦ ⟧ around matched terms (from ts_headline). */
  snippet: string;
  /** Where to open it on the desk. */
  href: string;
  /** Secondary label: activity name, cause, report number… */
  context: string | null;
  rank: number;
}

export const SEARCH_MARK_START = "⟦";
export const SEARCH_MARK_END = "⟧";

const MAX_PER_SOURCE = 25;

/**
 * Plain full-text search across one project's records: diary work lines
 * and notes, hold-ups, photo notes/filenames, approved report narrative
 * and issues, and programme activities. Postgres `websearch_to_tsquery`
 * handles quoted phrases and "-exclude"; a trigram-free ILIKE fallback
 * catches reference codes and short tokens the stemmer would miss
 * ("CBR", "EW-012", "M&E"). Snippets come from ts_headline with visible
 * markers so the UI never has to render server HTML.
 *
 * Volker's ask (8 Sep 2026): "when was that test done?" — dated hits that
 * link straight back to the diary day, photo or report.
 */
export async function searchProject(
  db: DB,
  projectId: string,
  rawQuery: string
): Promise<SearchHit[]> {
  const q = rawQuery.trim().slice(0, 200);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const base = `/projects/${projectId}`;

  // Shared fragments. `doc` is the searchable text for the source; the
  // matcher is FTS OR ILIKE so both prose and codes are found.
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const headlineOpts = sql`'StartSel=⟦, StopSel=⟧, MaxWords=28, MinWords=12, MaxFragments=1'`;
  // Filenames arrive as one hyphen/underscore-joined token
  // ("steel-erection-grid-c.jpg"); compare the spaced form too so the
  // phrase "steel erection" still finds them.
  const spaced = (doc: ReturnType<typeof sql>) => sql`translate(${doc}, '-_', '  ')`;
  const match = (doc: ReturnType<typeof sql>) =>
    sql`(to_tsvector('english', ${spaced(doc)}) @@ ${tsq} OR ${doc} ILIKE ${like} OR ${spaced(doc)} ILIKE ${like})`;
  const rank = (doc: ReturnType<typeof sql>) =>
    sql<number>`(ts_rank(to_tsvector('english', ${spaced(doc)}), ${tsq}) + CASE WHEN ${doc} ILIKE ${like} OR ${spaced(doc)} ILIKE ${like} THEN 0.2 ELSE 0 END)`;
  const headline = (doc: ReturnType<typeof sql>) =>
    sql<string>`ts_headline('english', ${doc}, ${tsq}, ${headlineOpts})`;

  // 1. Diary work lines (per-activity "what happened" records).
  const workDoc = sql`coalesce(wl.body, '')`;
  const workLines = db.execute<{
    entry_id: string;
    entry_date: string;
    task_name: string | null;
    snippet: string;
    rank: number;
  }>(sql`
    select e.id as entry_id, e.entry_date::text as entry_date, t.name as task_name,
           ${headline(workDoc)} as snippet, ${rank(workDoc)} as rank
    from diary_work_lines wl
    join diary_entries e on e.id = wl.entry_id
    left join tasks t on t.id = wl.task_id
    where e.project_id = ${projectId}::uuid and ${match(workDoc)}
    order by rank desc, e.entry_date desc
    limit ${MAX_PER_SOURCE}
  `);

  // 2. Diary day notes (work note, safety note, toolbox topic).
  const noteDoc = sql`concat_ws(' · ', e.work_note, e.safety_note, e.toolbox_topic)`;
  const notes = db.execute<{
    entry_id: string;
    entry_date: string;
    snippet: string;
    rank: number;
  }>(sql`
    select e.id as entry_id, e.entry_date::text as entry_date,
           ${headline(noteDoc)} as snippet, ${rank(noteDoc)} as rank
    from diary_entries e
    where e.project_id = ${projectId}::uuid and ${match(noteDoc)}
    order by rank desc, e.entry_date desc
    limit ${MAX_PER_SOURCE}
  `);

  // 3. Hold-ups: the thread note plus every day's note, and the activity.
  const holdupDoc = sql`concat_ws(' · ', h.note, t.name, (select string_agg(d.note, ' · ') from diary_holdup_days d where d.holdup_id = h.id))`;
  const holdups = db.execute<{
    id: string;
    cause: string;
    status: string;
    started_on: string;
    task_name: string | null;
    snippet: string;
    rank: number;
  }>(sql`
    select h.id, h.cause, h.status, h.started_on::text as started_on, t.name as task_name,
           ${headline(holdupDoc)} as snippet, ${rank(holdupDoc)} as rank
    from diary_holdups h
    left join tasks t on t.id = h.task_id
    where h.project_id = ${projectId}::uuid and ${match(holdupDoc)}
    order by rank desc, h.started_on desc
    limit ${MAX_PER_SOURCE}
  `);

  // 4. Photos: caption/note and original filename.
  const photoDoc = sql`concat_ws(' · ', ev.note, ev.original_filename)`;
  const photos = db.execute<{
    id: string;
    when_at: string | null;
    original_filename: string | null;
    task_name: string | null;
    snippet: string;
    rank: number;
  }>(sql`
    select ev.id, coalesce(ev.captured_at, ev.uploaded_at)::date::text as when_at,
           ev.original_filename,
           (select t.name from evidence_links l join tasks t on t.id = l.task_id where l.evidence_id = ev.id limit 1) as task_name,
           ${headline(photoDoc)} as snippet, ${rank(photoDoc)} as rank
    from evidence ev
    where ev.project_id = ${projectId}::uuid and ev.deleted_at is null and ${match(photoDoc)}
    order by rank desc, when_at desc
    limit ${MAX_PER_SOURCE}
  `);

  // 5. Issued reports: approved narrative, key issues, key risks.
  const reportDoc = sql`concat_ws(' · ',
      (select string_agg(p, ' ') from jsonb_array_elements_text(coalesce(r.report_data->'narrative'->'paragraphs', '[]'::jsonb)) p),
      (select string_agg(p, ' ') from jsonb_array_elements_text(coalesce(r.report_data->'keyIssues', '[]'::jsonb)) p),
      (select string_agg(p, ' ') from jsonb_array_elements_text(coalesce(r.report_data->'keyRisks', '[]'::jsonb)) p))`;
  const reportsQ = db.execute<{
    id: string;
    report_number: number;
    period_start: string;
    period_end: string;
    snippet: string;
    rank: number;
  }>(sql`
    select r.id, r.report_number, r.period_start::text as period_start, r.period_end::text as period_end,
           ${headline(reportDoc)} as snippet, ${rank(reportDoc)} as rank
    from reports r
    where r.project_id = ${projectId}::uuid and r.status = 'completed' and ${match(reportDoc)}
    order by rank desc, r.period_end desc
    limit ${MAX_PER_SOURCE}
  `);

  // 6. Programme activities.
  const taskDoc = sql`concat_ws(' · ', t.name, t.description, t.source_ref)`;
  const tasksQ = db.execute<{
    id: string;
    name: string;
    planned_start: string | null;
    status: string | null;
    snippet: string;
    rank: number;
  }>(sql`
    select t.id, t.name, t.planned_start::text as planned_start, t.status,
           ${headline(taskDoc)} as snippet, ${rank(taskDoc)} as rank
    from tasks t
    where t.project_id = ${projectId}::uuid and ${match(taskDoc)}
    order by rank desc, t.sort_order asc
    limit ${MAX_PER_SOURCE}
  `);

  const [wl, nt, hu, ph, rp, tk] = await Promise.all([
    workLines,
    notes,
    holdups,
    photos,
    reportsQ,
    tasksQ,
  ]);

  const hits: SearchHit[] = [];
  for (const r of wl) {
    hits.push({
      kind: "diary_work",
      date: r.entry_date,
      title: r.task_name ? `Work on ${r.task_name}` : "Site diary work record",
      snippet: r.snippet,
      href: `${base}/diary?week=${r.entry_date}&entry=${r.entry_id}`,
      context: r.task_name,
      rank: Number(r.rank),
    });
  }
  for (const r of nt) {
    hits.push({
      kind: "diary_note",
      date: r.entry_date,
      title: "Site diary notes",
      snippet: r.snippet,
      href: `${base}/diary?week=${r.entry_date}&entry=${r.entry_id}`,
      context: null,
      rank: Number(r.rank),
    });
  }
  for (const r of hu) {
    const cause =
      (HOLDUP_CAUSE_LABELS as Record<string, string>)[r.cause] ?? r.cause;
    hits.push({
      kind: "holdup",
      date: r.started_on,
      title: `Hold-up — ${cause}${r.status === "open" ? " (open)" : ""}`,
      snippet: r.snippet,
      href: `${base}/diary?week=${r.started_on}`,
      context: r.task_name,
      rank: Number(r.rank),
    });
  }
  for (const r of ph) {
    hits.push({
      kind: "photo",
      date: r.when_at,
      title: r.original_filename ? `Photo ${r.original_filename}` : "Photo",
      snippet: r.snippet,
      href: `${base}/evidence?q=${encodeURIComponent(r.original_filename ?? q)}`,
      context: r.task_name,
      rank: Number(r.rank),
    });
  }
  for (const r of rp) {
    hits.push({
      kind: "report",
      date: r.period_end,
      title: `Report ${r.report_number}`,
      snippet: r.snippet,
      href: `${base}/reports/${r.id}/send`,
      context: `${r.period_start} to ${r.period_end}`,
      rank: Number(r.rank),
    });
  }
  for (const r of tk) {
    hits.push({
      kind: "task",
      date: r.planned_start,
      title: r.name,
      snippet: r.snippet,
      href: `${base}/tasks`,
      context: r.status ? r.status.replace(/_/g, " ") : null,
      rank: Number(r.rank),
    });
  }

  // Best matches first; ties by most recent so "when was X done" reads
  // newest-down.
  hits.sort((a, b) => b.rank - a.rank || (b.date ?? "").localeCompare(a.date ?? ""));
  return hits.slice(0, 60);
}
