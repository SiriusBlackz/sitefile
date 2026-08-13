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
          "The narrative as 3-6 short paragraphs, in reading order. Plain prose — no headings, bullets, or markdown.",
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
- 3 to 6 short paragraphs via the submit_narrative tool. No headings, bullet points, or markdown.
- UK English spelling. Dates written as they appear in the facts.
- Cover, in roughly this order: overall progress against programme (including variance, honestly — behind is behind), what was completed and what progressed this period, any delayed or overdue activities and their programme impact, evidence captured, and a brief close on the coming period drawn from the lookahead.
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
  // Skip the expensive gather work (gallery URL signing, before/after
  // pairing) — the narrative only needs the programme + stats facts.
  const data = await gatherReportData(db, {
    ...input,
    reportNumber: 0,
    sections: { gallery: false, beforeAfter: false },
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

  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL_NARRATIVE,
    max_tokens: 2048,
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
