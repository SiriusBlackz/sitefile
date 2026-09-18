"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { ProjectForm, type ProjectFormValues } from "@/components/projects/project-form";
import { toast } from "sonner";

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectContent />
    </Suspense>
  );
}

function NewProjectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") === "cancelled") {
      toast.error("Payment cancelled. You can try creating the project again.");
    }
  }, [searchParams]);

  const createProject = trpc.project.create.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        toast.success("Redirecting to checkout...");
        window.location.href = data.checkoutUrl;
      } else {
        toast.success("Project created");
        router.push(`/projects/${data.project.id}`);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (values: ProjectFormValues) => {
    createProject.mutate(values);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Project</h1>
        <p className="text-muted-foreground">
          Set up a project for progress reporting or a defects inspection.
        </p>
      </div>
      <ProjectForm
        allowTypeChoice
        onSubmit={handleSubmit}
        isSubmitting={createProject.isPending}
        submitLabel="Create Project"
      />
    </div>
  );
}
