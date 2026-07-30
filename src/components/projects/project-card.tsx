"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Building2 } from "lucide-react";
import type { Project } from "@/types/project";
import { formatDateRange } from "@/lib/format";
import { getProjectStatusColor, getProjectStatusLabel } from "@/lib/project-status";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{project.name}</CardTitle>
            <Badge
              variant="secondary"
              className={getProjectStatusColor(project.status)}
            >
              {getProjectStatusLabel(project.status)}
            </Badge>
          </div>
          {project.reference && (
            <p className="text-sm text-muted-foreground">
              Ref: {project.reference}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {project.clientName && (
            <div className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {project.clientName}
            </div>
          )}
          {(project.startDate || project.endDate) && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateRange(project.startDate, project.endDate)}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
