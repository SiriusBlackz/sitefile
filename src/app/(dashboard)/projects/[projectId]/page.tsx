"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Settings,
  ListTodo,
  Camera,
  Map,
  FileText,
  Calendar,
  Building2,
  ClipboardList,
  ImageIcon,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { formatDateRange } from "@/lib/format";
import { BillingBanner } from "@/components/projects/billing-banner";
import { NextStepBanner } from "@/components/projects/next-step-banner";
import { getProjectStatusColor, getProjectStatusLabel } from "@/lib/project-status";

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const { data: project, isLoading } = trpc.project.get.useQuery({
    id: params.projectId,
  });
  const { data: tasks = [] } = trpc.task.list.useQuery(
    { projectId: params.projectId },
    { enabled: !!params.projectId }
  );
  const { data: evidenceCount } = trpc.evidence.count.useQuery(
    { projectId: params.projectId },
    { enabled: !!params.projectId }
  );
  const { data: reportsData } = trpc.report.list.useQuery(
    { projectId: params.projectId },
    { enabled: !!params.projectId }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const delayedTasks = tasks.filter((t) => t.status === "delayed").length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const totalReports = reportsData?.length ?? 0;

  const navSections = [
    {
      label: "Work",
      items: [
        { href: `/capture?projectId=${project.id}`, label: "Capture Photos", icon: Camera, description: "Take site photos" },
        { href: `/projects/${project.id}/tasks`, label: "Tasks", icon: ListTodo, description: `${totalTasks} tasks, ${completedTasks} done` },
        { href: `/projects/${project.id}/evidence`, label: "Evidence", icon: ImageIcon, description: "Photos & videos" },
      ],
    },
    {
      label: "Intelligence",
      items: [
        { href: `/projects/${project.id}/zones`, label: "GPS Zones", icon: Map, description: "Auto-link by location" },
        { href: `/projects/${project.id}/reports`, label: "Reports", icon: FileText, description: `${totalReports} generated` },
      ],
    },
    {
      label: "Admin",
      items: [
        { href: `/projects/${project.id}/audit`, label: "Audit Log", icon: ClipboardList, description: "Activity history" },
        { href: `/projects/${project.id}/settings`, label: "Settings", icon: Settings, description: "Project config" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <BillingBanner status={project.status} />

      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <Badge
            variant="secondary"
            className={getProjectStatusColor(project.status)}
          >
            {getProjectStatusLabel(project.status)}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
          {project.reference && <span>Ref: {project.reference}</span>}
          {project.clientName && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {project.clientName}
            </span>
          )}
          {(project.startDate || project.endDate) && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateRange(project.startDate, project.endDate)}
            </span>
          )}
        </div>
      </div>

      {/* Progress Stats */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="text-2xl font-bold">{progressPct}%</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {delayedTasks > 0 && (
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                {delayedTasks} delayed
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Tasks</p>
            <p className="text-2xl font-bold">{completedTasks}<span className="text-base font-normal text-muted-foreground">/{totalTasks}</span></p>
            <p className="text-xs text-muted-foreground mt-1">completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Evidence</p>
            <p className="text-2xl font-bold">{evidenceCount?.count ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">photos & videos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Reports</p>
            <p className="text-2xl font-bold">{totalReports}</p>
            <p className="text-xs text-muted-foreground mt-1">generated</p>
          </CardContent>
        </Card>
      </div>

      {/* Next-step nudge — below header + stats so users see the project context first */}
      <NextStepBanner
        projectId={project.id}
        taskCount={totalTasks}
        evidenceCount={evidenceCount?.count ?? 0}
      />

      {/* Navigation Sections — Work, Intelligence, Admin (3 equal-weight sections) */}
      {navSections.map((section) => (
        <div key={section.label}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">{section.label}</h3>
          <div className="grid gap-2 md:grid-cols-3">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-background">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
