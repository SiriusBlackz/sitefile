"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProjectCard } from "@/components/projects/project-card";
import { AlertTriangle, FolderKanban, Plus } from "lucide-react";

export default function ProjectsPage() {
  const { data: projects, isLoading, error, refetch, isRefetching } =
    trpc.project.list.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage your construction projects
          </p>
        </div>
        <Link href="/projects/new" className={cn(buttonVariants())}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg border bg-muted"
            />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h3 className="mt-4 text-lg font-semibold">Couldn&apos;t load projects</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {error.message || "Something went wrong fetching your projects."}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            {isRefetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first project to start tracking evidence.
          </p>
          <Link
            href="/projects/new"
            className={cn(buttonVariants(), "mt-4")}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </div>
      )}
    </div>
  );
}
