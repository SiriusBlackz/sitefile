/**
 * Per-project diary additions (package 3b). All off by default so the
 * 90-second phone ritual holds; the PM switches them on in settings for
 * sites that report the VFL way.
 */
export interface DiaryExtras {
  /** Contractors-on-site table (company · discipline · headcount) replaces the single operatives number. */
  contractors: boolean;
  /** "Planned for tomorrow" line on the work step. */
  plannedWorks: boolean;
  /** "Impact on next day" line on the hold-ups step. */
  nextDayImpact: boolean;
}

export interface DiaryContractor {
  company: string;
  discipline: string;
  headcount: number;
}

export const DIARY_EXTRA_LABELS: Record<keyof DiaryExtras, { label: string; help: string }> = {
  contractors: { label: "Contractors on site", help: "Company, discipline and headcount per contractor. The operatives total becomes the sum." },
  plannedWorks: { label: "Planned works for tomorrow", help: "One line on the work step: what is planned next." },
  nextDayImpact: { label: "Impact on next day", help: "One line on the hold-ups step: what today's disruption does to tomorrow." },
};

export function parseDiaryExtras(raw: unknown): DiaryExtras {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { contractors: o.contractors === true, plannedWorks: o.plannedWorks === true, nextDayImpact: o.nextDayImpact === true };
}

export function parseContractors(raw: unknown): DiaryContractor[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({ company: String(c.company ?? ""), discipline: String(c.discipline ?? ""), headcount: Number(c.headcount ?? 0) || 0 }))
    .filter((c) => c.company.trim().length > 0);
}
