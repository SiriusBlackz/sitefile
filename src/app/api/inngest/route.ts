import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { generateReport } from "@/server/inngest/functions/generate-report";
import { processUpload } from "@/server/inngest/functions/process-upload";
import { deleteProjectStorage } from "@/server/inngest/functions/delete-project-storage";

// Report generation launches Chromium and renders a photo-heavy PDF in a
// single step; Vercel's default function timeout kills it mid-render.
// Vercel clamps this to the plan's maximum.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateReport, processUpload, deleteProjectStorage],
});
