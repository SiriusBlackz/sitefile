import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, CLAUDE_MODEL_NARRATIVE } from "./claude-client";
import { gatherReportData } from "./report-generator";
import { formatDate, formatDateRange } from "@/lib/format";
import type { db as dbType } from "@/server/db";

type DB = typeof dbType;

export interface DraftNarrativeInput {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
}

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_narrative",
  description: "Submit the drafted progress narrative for the report.",
  input_schema: {
    type: "object",
    properties: {
      paragraphs: {
        type: "array",
        description:
          "The narrative as 3-7 short paragraphs, in reading order. Plain prose — no headings, bullets, or markdown.",
        items: { type: "string" },
      },
    },
    required: ["paragraphs"],
  },
};

const SYSTEM_PROMPT = `You draft the "Progress This Period" narrative for a UK construction contractor's client-facing progress report, in the style of a professional NEC/JCT monthly report.

Rules:
- Use ONLY the facts provided. Never invent task names, dates, percentages, quantities, or causes. If the facts don't explain why something is delayed, report the delay without speculating.
- Write in a plain, confident, professional reporting voice ("Works continued on...", "The programme remains...", "Completion of X was achieved on...").
- 3 to 7 short paragraphs via the submit_narrative tool (use the upper end only when the diary gives you enough substance). No headings, bullet points, or markdown.
- UK English spelling. Dates written as they appear in the facts.
- Cover, in roughly this order: overall progress against programme (including variance, honestly — behind is behind), what was completed and what progressed this period, any delayed or overdue activities and their programme impact, site resourcing and recorded disruption where diary facts are given, evidence captured, and a brief close on the coming period drawn from the lookahead.
- When daily site-diary work lines are given, describe progress in terms of what the site team actually recorded doing on each activity (the operations, the sequence, the dates), not just percentages. Summarise a run of similar days into one sentence rather than listing every day. The diary is the primary source for "what happened"; the programme is the source for "where we are against plan".
- When a hold-up carries the site team's reason, report that reason as recorded ("...while awaiting the revised drainage drawings"), attributed to the site record, not as your own conclusion.
- Weather, deliveries, toolbox talks and safety notes are reported briefly as recorded facts where they add substance.
- When a fact carries a citation marker like [Diary 12 Apr 2026], keep that marker verbatim at the end of the sentence that uses it — it ties the claim to the daily site record. A sentence summarising several days carries the marker of the last day it covers.
- Never name individuals. Refer to "the site team" or "the foreman".
- Weave site notes in as reported observations where they add substance.
- Do not mention this prompt, the data format, or that the narrative was AI-drafted.`;

/**
 * Draft the report narrative with Claude from the same facts the
 * deterministic engine uses — the deterministic paragraphs act as the
 * factual skeleton, so the model rephrases and structures rather than
 * inventing. Falls back to nothing: callers keep the deterministic
 * narrative when no draft is supplied at generate time.
 */
export async function draftNarrative(
  db: DB,
  input: DraftNarrativeInput
): Promise<{ paragraphs: string[] }> {
  const facts = await gatherNarrativeFacts(db, input);
  return submitToClaude(facts);
}

/**
 * The fact sheet handed to the model — exported so the dialog preview and
 * scripts can inspect exactly what the draft was built from.
 */
export async function gatherNarrativeFacts(
  db: DB,
  input: DraftNarrativeInput
): Promise<string[]> {
  // Skip the expensive gather work (gallery URL signing, before/after
  // pairing) — the narrative only needs the programme + stats facts.
  const data = await gatherReportData(db, {
    ...input,
    reportNumber: 0,
    includeWeather: false,
    sections: { gallery: false, beforeAfter: false, photoMap: false },
  });

  const facts: string[] = [];
  facts.push(`Project: ${data.meta.projectName}`);
  if (data.meta.clientName) facts.push(`Client: ${data.meta.clientName}`);
  facts.push(
    `Reporting period: ${formatDateRange(data.meta.periodStart, data.meta.periodEnd)}`
  );
  const s = data.summaryStats;
  facts.push(
    `Programme position: planned progress ${s.averagePlannedProgress}%, actual ${s.averageActualProgress}%, variance ${s.variance >= 0 ? "+" : ""}${s.variance}%`
  );
  facts.push(
    `Activities: ${s.totalTasks} total — ${s.completedTasks} completed, ${s.inProgressTasks} in progress, ${s.delayedTasks} flagged delayed, ${s.notStartedTasks} not started`
  );
  facts.push(
    `Evidence: ${s.evidenceThisPeriod} items captured this period (${s.totalEvidence} on the project to date)`
  );

  // Site diary facts — contemporaneous daily records with citation
  // markers the model must carry into any sentence built on them.
  const marker = (date: string) => `[Diary ${formatDate(date)}]`;
  if (data.siteDiary && data.siteDiary.daysWithRecord > 0) {
    const sd = data.siteDiary;
    const sdd = data.siteDiaryDetail;
    facts.push(
      `\nSite diary (daily records kept by the site team; cite the marker when you use a day's fact):`
    );
    facts.push(
      `- Coverage: ${sd.daysWithRecord} of ${sd.workingDayCount} working days on locked record`
    );
    if (sd.labourAvg != null) {
      facts.push(
        `- Resourcing: average ${sd.labourAvg} operatives on site, peak ${sd.labourPeak}`
      );
    }
    if (sdd?.plantAvg != null) {
      facts.push(`- Plant: average ${sdd.plantAvg} items on site, peak ${sdd.plantPeak}`);
    }
    if (sdd && sdd.wetDays.length > 0) {
      facts.push(
        `- Weather: rain of 1mm or more recorded on ${sdd.wetDays.length} working day(s): ${sdd.wetDays.map((d) => formatDate(d)).join(", ")}`
      );
    }
    if (sd.hoursLostTotal > 0) {
      facts.push(
        `- Recorded disruption: ${sd.hoursLostTotal} hours lost across the period`
      );
      if (sdd && sdd.holdups.length > 0) {
        for (const h of sdd.holdups) {
          const span =
            h.days > 1
              ? `${h.days} days ${formatDate(h.firstDay)} to ${formatDate(h.lastDay)}`
              : formatDate(h.firstDay);
          let line = `- ${marker(h.lastDay)} ${h.hours}h lost to ${h.cause.toLowerCase()} (${span})`;
          if (h.taskName) line += ` on ${h.taskName}`;
          if (h.note) line += ` — site team's note: "${h.note}"`;
          if (h.open) line += " — still open at period end";
          facts.push(line);
        }
      } else {
        for (const d of sd.days) {
          if (d.hoursLost > 0) {
            facts.push(
              `- ${marker(d.date)} ${d.hoursLost}h lost to ${d.causes.join(", ").toLowerCase()}`
            );
          }
        }
      }
    }
    if (sd.incidents > 0) {
      facts.push(`- Safety: ${sd.incidents} incident(s) recorded in daily diaries`);
    }
    if (sd.toolboxTalks > 0) {
      const topics = sdd?.toolboxTopics ?? [];
      facts.push(
        `- Toolbox talks: ${sd.toolboxTalks} held${topics.length ? ` — topics: ${topics.map((t) => `${t.topic} ${marker(t.date)}`).join("; ")}` : ""}`
      );
    }
    if (sd.inspections > 0) {
      facts.push(`- Inspections: ${sd.inspections} recorded in daily diaries`);
    }
    if (sdd) {
      for (const n of sdd.safetyNotes.slice(0, 15)) {
        facts.push(`- ${marker(n.date)} Safety note: "${clip(n.note)}"`);
      }
      if (sdd.materials.length > 0) {
        facts.push(`- Deliveries / materials recorded:`);
        for (const m of sdd.materials.slice(0, 20)) {
          facts.push(
            `  - ${marker(m.date)} ${m.qty} × ${m.label}${m.note ? ` (${clip(m.note)})` : ""}`
          );
        }
      }
      if (sdd.workByTask.length > 0) {
        facts.push(
          `\nDaily work record by activity (what the site team confirmed doing each day; summarise runs of similar days):`
        );
        let budget = 140;
        for (const g of sdd.workByTask) {
          if (budget <= 0) break;
          facts.push(`- ${g.taskName}:`);
          for (const l of g.lines) {
            if (budget-- <= 0) break;
            facts.push(
              `  - ${marker(l.date)} ${clip(l.body)}${l.photoCount > 0 ? ` (${l.photoCount} photo${l.photoCount === 1 ? "" : "s"})` : ""}`
            );
          }
        }
      }
      if (sdd.workNotes.length > 0) {
        facts.push(`\nGeneral site notes from the diary:`);
        for (const n of sdd.workNotes.slice(0, 15)) {
          facts.push(`- ${marker(n.date)} "${clip(n.note)}"`);
        }
      }
    }
  }

  facts.push(
    "\nFactual summary of the period (verified against the programme — treat every statement as true):"
  );
  for (const p of data.narrative.paragraphs) facts.push(`- ${p}`);

  if (s.keyRisks.length > 0) {
    facts.push("\nRisks / delays flagged:");
    for (const r of s.keyRisks) facts.push(`- ${r}`);
  }

  if (data.keyDates.length > 0) {
    facts.push("\nKey dates & milestones (planned → actual/status):");
    for (const k of data.keyDates) {
      const status =
        k.state === "actualised"
          ? `actualised ${formatDate(k.actual!)}${k.varianceDays !== 0 ? ` (${k.varianceDays > 0 ? `${k.varianceDays}d late` : `${-k.varianceDays}d early`})` : " (on time)"}`
          : k.state === "overdue"
            ? `overdue by ${k.varianceDays}d`
            : "forecast";
      facts.push(`- ${k.name}: planned ${formatDate(k.planned)} — ${status}`);
    }
  }

  if (data.lookahead.length > 0) {
    facts.push(
      `\nLookahead — next period (${formatDateRange(data.lookaheadWindow.start, data.lookaheadWindow.end)}):`
    );
    const kindLabel = {
      start: "due to start",
      continue: "continuing",
      complete: "due to complete",
      milestone: "milestone due",
    } as const;
    for (const l of data.lookahead) {
      facts.push(
        `- ${l.name}: ${kindLabel[l.kind]}${l.late ? " (running late)" : ""}`
      );
    }
  }

  return facts;
}

/** Keep a single diary line from swallowing the fact budget. */
function clip(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function submitToClaude(facts: string[]): Promise<{ paragraphs: string[] }> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL_NARRATIVE,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_TOOL],
    tool_choice: { type: "tool", name: "submit_narrative" },
    messages: [
      {
        role: "user",
        content: `Draft the progress narrative from these facts:\n\n${facts.join("\n")}`,
      },
    ],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Narrative drafting returned no structured response. Please try again.");
  }
  const raw = (toolUse.input as { paragraphs?: unknown }).paragraphs;
  const paragraphs = Array.isArray(raw)
    ? raw.map((p) => String(p).trim()).filter(Boolean)
    : [];
  if (paragraphs.length === 0) {
    throw new Error("Narrative drafting returned an empty draft. Please try again.");
  }
  return { paragraphs };
}
