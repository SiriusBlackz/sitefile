import type Anthropic from "@anthropic-ai/sdk";
import type { ParsedTask } from "./programme-import";
import { getAnthropicClient, CLAUDE_MODEL_PDF } from "./claude-client";

export interface PdfParseResult {
  tasks: ParsedTask[];
  confidence: number;
}

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_programme",
  description:
    "Submit the extracted construction-programme tasks for ingestion.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        description:
          "Every task / activity in the programme, including summary parents and leaf tasks.",
        items: {
          type: "object",
          properties: {
            sourceRef: {
              type: "string",
              description:
                "Stable identifier from the document — WBS code (e.g. '1.2.3') if present, else a row index.",
            },
            name: {
              type: "string",
              description: "Task or activity name as it appears in the document.",
            },
            parentSourceRef: {
              type: ["string", "null"],
              description:
                "sourceRef of the immediate parent task, or null for top-level tasks.",
            },
            plannedStart: {
              type: ["string", "null"],
              description:
                "Planned start date in ISO 8601 (YYYY-MM-DD). Null if not visible in the document.",
            },
            plannedEnd: {
              type: ["string", "null"],
              description:
                "Planned end / finish date in ISO 8601 (YYYY-MM-DD). Null if not visible.",
            },
            progressPct: {
              type: "number",
              description:
                "Percent complete, 0-100. Default to 0 if no progress is shown.",
            },
          },
          required: [
            "sourceRef",
            "name",
            "parentSourceRef",
            "plannedStart",
            "plannedEnd",
            "progressPct",
          ],
        },
      },
      confidence: {
        type: "number",
        description:
          "Your overall confidence in the extraction quality, 0 to 1. Lower if dates are unclear, the PDF is hand-drawn, or the layout is ambiguous.",
      },
    },
    required: ["tasks", "confidence"],
  },
};

const SYSTEM_PROMPT = `You extract construction project programmes (Gantt charts, schedules, work plans) from PDF documents.

You receive a PDF and must return every task you can identify via the submit_programme tool. Rules:
- Extract ALL tasks visible in the document, including summary/parent tasks AND their child tasks. Use the document's hierarchy (WBS, indentation, grouping).
- Date format MUST be ISO 8601 YYYY-MM-DD. If a date is ambiguous (e.g. "01/05/26"), assume DD/MM/YYYY (UK construction default).
- If you cannot read a date confidently, set it to null rather than guessing.
- progressPct must be 0-100. If not shown, use 0.
- Set parentSourceRef to the parent's sourceRef (your own assigned WBS or row index), or null for top-level rows.
- Confidence: 1.0 = fully readable native-text PDF with clear dates; 0.7 = some ambiguity; 0.4 = scanned / handwritten / poor quality.
- Do NOT invent tasks. Only return what is visible in the document.`;

export async function parsePdfBuffer(buf: Buffer): Promise<PdfParseResult> {
  const anthropic = getAnthropicClient();
  const base64 = buf.toString("base64");

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL_PDF,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_TOOL],
    tool_choice: { type: "tool", name: "submit_programme" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: "Extract every task or activity visible in this programme PDF.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      "Claude did not return a structured response. The PDF may be unreadable."
    );
  }

  const result = toolUse.input as {
    tasks?: unknown[];
    confidence?: number;
  };
  if (!Array.isArray(result.tasks) || result.tasks.length === 0) {
    throw new Error(
      "No tasks could be extracted from the PDF. Try a clearer scan or a different export."
    );
  }

  const tasks: ParsedTask[] = result.tasks.map((t, i) => {
    const raw = t as Record<string, unknown>;
    return {
      sourceRef: String(raw.sourceRef ?? `pdf-row-${i}`),
      name: String(raw.name ?? "Unnamed Task"),
      parentSourceRef:
        raw.parentSourceRef == null ? null : String(raw.parentSourceRef),
      plannedStart: raw.plannedStart == null ? null : String(raw.plannedStart),
      plannedEnd: raw.plannedEnd == null ? null : String(raw.plannedEnd),
      actualStart: null,
      actualEnd: null,
      progressPct: clampPct(raw.progressPct),
      sortOrder: i,
    };
  });

  const confidence =
    typeof result.confidence === "number"
      ? Math.min(Math.max(result.confidence, 0), 1)
      : 0.5;

  return { tasks, confidence };
}

function clampPct(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), 100);
}
