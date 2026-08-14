"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronRight } from "lucide-react";

/**
 * The A-to-Z path from empty project to first report, derived from real
 * data so it always points at the genuine next step. Replaces the old
 * two-state NextStepBanner, which went silent after photos existed and
 * never surfaced branding at all. Disappears for good once the first
 * report is generated — by then the user knows the flow.
 */

interface StepAction {
  label: string;
  href: string;
  outline?: boolean;
}

interface Step {
  title: string;
  done: boolean;
  desc: string;
  actions: StepAction[];
}

export function ReportChecklist({
  projectId,
  taskCount,
  evidenceCount,
  linkedCount,
  reportCount,
  clientLogoSet,
  isTouch,
}: {
  projectId: string;
  taskCount: number;
  evidenceCount: number;
  linkedCount: number;
  reportCount: number;
  clientLogoSet: boolean;
  isTouch: boolean;
}) {
  const journeyDone = reportCount > 0;
  const { data: org } = trpc.org.get.useQuery(undefined, {
    enabled: !journeyDone,
  });

  if (journeyDone) return null;

  const brandingDone = !!(org?.logoUrl || org?.brandColor || clientLogoSet);

  const steps: Step[] = [
    {
      title: "Load your programme",
      done: taskCount > 0,
      desc: "Import your Gantt chart (MS Project, P6, Excel or PDF) — or add tasks by hand.",
      actions: [{ label: "Import programme", href: `/projects/${projectId}/tasks` }],
    },
    {
      title: "Add your branding",
      done: brandingDone,
      desc: "Your logo and company colour go on every report cover — add your client's logo too.",
      actions: [
        { label: "Company branding", href: "/account" },
        { label: "Client logo", href: `/projects/${projectId}/settings`, outline: true },
      ],
    },
    {
      title: "Capture site photos",
      done: evidenceCount > 0,
      desc: isTouch
        ? "Take photos on site — GPS and timestamps are captured automatically."
        : "Upload site photos — GPS and timestamps are read from each file automatically.",
      actions: isTouch
        ? [
            { label: "Capture photos", href: `/capture?projectId=${projectId}` },
            { label: "Upload instead", href: `/projects/${projectId}/evidence`, outline: true },
          ]
        : [{ label: "Upload photos", href: `/projects/${projectId}/evidence` }],
    },
    {
      title: "Link photos to their tasks",
      done: linkedCount > 0,
      desc: "Open a photo and pick its programme task. Draw GPS zones first and Sitefile suggests the link for you.",
      actions: [
        { label: "Link evidence", href: `/projects/${projectId}/evidence` },
        { label: "Draw GPS zones", href: `/projects/${projectId}/zones`, outline: true },
      ],
    },
    {
      title: "Generate your report",
      done: false, // reportCount > 0 hides the whole card above
      desc: "A branded, client-ready PDF: narrative, programme, milestones, photos and verification.",
      actions: [{ label: "Generate report", href: `/projects/${projectId}/reports` }],
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const activeIdx = steps.findIndex((s) => !s.done);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Building your first report</h2>
          <span className="text-xs text-muted-foreground">
            {doneCount} of {steps.length} steps done
          </span>
        </div>

        <ol className="space-y-1">
          {steps.map((step, i) => {
            const isActive = i === activeIdx;
            return (
              <li key={step.title}>
                <div
                  className={cn(
                    "flex items-start gap-3 rounded-lg px-2 py-2",
                    isActive && "bg-blue-50 dark:bg-blue-950/20"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      step.done
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : isActive
                          ? "bg-blue-600 text-white"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      {/* No strike-through: it reads as "unavailable", not
                          "done" (pilot feedback). Done = check + muted text,
                          still linked so e.g. branding stays reachable. */}
                      <p
                        className={cn(
                          "text-sm font-medium",
                          step.done && "text-muted-foreground"
                        )}
                      >
                        {step.title}
                        {step.done && (
                          <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                            Done
                          </span>
                        )}
                      </p>
                      {!isActive && (
                        <Link
                          href={step.actions[0].href}
                          aria-label={step.actions[0].label}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                    {isActive && (
                      <>
                        <p className="mt-0.5 text-sm text-muted-foreground">{step.desc}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {step.actions.map((a) => (
                            <Link
                              key={a.href}
                              href={a.href}
                              className={cn(
                                buttonVariants({
                                  variant: a.outline ? "outline" : "default",
                                  size: "sm",
                                })
                              )}
                            >
                              {a.label}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
