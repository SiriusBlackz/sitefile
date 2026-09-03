import { createTRPCRouter } from "../index";
import { projectRouter } from "./project";
import { taskRouter } from "./task";
import { evidenceRouter } from "./evidence";
import { zoneRouter } from "./zone";
import { reportRouter } from "./report";
import { auditRouter } from "./audit";
import { dashboardRouter } from "./dashboard";
import { orgRouter } from "./org";
import { diaryRouter } from "./diary";

export const appRouter = createTRPCRouter({
  diary: diaryRouter,
  project: projectRouter,
  task: taskRouter,
  evidence: evidenceRouter,
  zone: zoneRouter,
  report: reportRouter,
  audit: auditRouter,
  org: orgRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
