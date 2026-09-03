"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgBrandingForm } from "@/components/projects/org-branding-form";
import { AddColleagueForm } from "@/components/projects/add-colleague-form";
import { ProjectForm, type ProjectFormValues } from "@/components/projects/project-form";
import { ImportDialog } from "@/components/tasks/import-dialog";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, FileUp } from "lucide-react";

const STEPS = [
  "Company & branding",
  "Site team",
  "First project",
  "Programme",
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [addedColleagues, setAddedColleagues] = useState<
    { id: string; email: string }[]
  >([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const completeOnboarding = trpc.org.completeOnboarding.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const createProject = trpc.project.create.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const addMember = trpc.project.memberAdd.useMutation();

  // Stamp completion first so the Stripe checkout redirect (which leaves
  // this page for good) can't strand the account in the wizard.
  async function handleCreateProject(values: ProjectFormValues) {
    try {
      await completeOnboarding.mutateAsync();
    } catch {
      return; // toast already shown; stay on the step
    }
    let data;
    try {
      data = await createProject.mutateAsync(values);
    } catch {
      return; // toast already shown; stay on the step
    }
    // Put the wizard's colleagues on the project before any redirect —
    // without a membership row they'd be locked out of every project.
    const results = await Promise.allSettled(
      addedColleagues.map((c) =>
        addMember.mutateAsync({ projectId: data.project.id, userId: c.id })
      )
    );
    if (results.some((r) => r.status === "rejected")) {
      toast.error(
        "Some team members couldn't be added to the project — add them again from project settings."
      );
    }
    if (data.checkoutUrl) {
      toast.success("Redirecting to checkout...");
      window.location.href = data.checkoutUrl;
    } else {
      setProjectId(data.project.id);
      setStep(3);
    }
  }

  async function skipSetup() {
    setLeaving(true);
    try {
      await completeOnboarding.mutateAsync();
      router.push("/");
    } catch {
      setLeaving(false);
    }
  }

  function finishToProject() {
    if (projectId) router.push(`/projects/${projectId}`);
    else router.push("/");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome to Sitefile
          </h1>
          <p className="text-sm text-muted-foreground">
            A few minutes now and your first report already carries your
            branding, your team and your programme.
          </p>
        </div>
        {/* Steps 0-1 can bail to the dashboard; from step 2 on, the
            project form's own flow finishes the wizard. */}
        {step < 2 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={skipSetup}
            disabled={leaving || completeOnboarding.isPending}
          >
            Skip setup
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "border-2 border-primary text-foreground"
                    : "border text-muted-foreground"
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs",
                i === step
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-px w-4 bg-border" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Company name, logo and colour go on the cover of every report
              you send to a client.
            </p>
            <OrgBrandingForm />
            <div className="flex justify-end border-t pt-4">
              <Button onClick={() => setStep(1)}>
                Continue
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your site team (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add the people who&apos;ll capture photos on site. Each gets
              an invitation email; if it doesn&apos;t arrive they can simply
              sign up at www.sitefile.app/sign-up with the same address and
              their account lands in your organisation.
            </p>
            <AddColleagueForm
              onAdded={(user) =>
                setAddedColleagues((prev) => [...prev, user])
              }
            />
            {addedColleagues.length > 0 && (
              <ul className="space-y-1 text-sm">
                {addedColleagues.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    {c.email}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between border-t pt-4">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>
                {addedColleagues.length > 0 ? "Continue" : "Skip for now"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set up the project you&apos;ll report on. You can adjust
            everything later in project settings.
          </p>
          <ProjectForm
            onSubmit={handleCreateProject}
            isSubmitting={createProject.isPending || completeOnboarding.isPending}
            submitLabel="Create Project"
          />
          <Button variant="ghost" onClick={() => setStep(1)}>
            Back
          </Button>
        </div>
      )}

      {step === 3 && projectId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Load your programme (optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import your programme (MS Project / P6 XML, Excel or PDF) and
              every photo you capture can be linked to a real activity. You
              can also do this later from the Programme screen.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setImportOpen(true)}>
                <FileUp className="mr-1 h-4 w-4" />
                Import programme
              </Button>
              <Button variant="outline" onClick={finishToProject}>
                Do this later
              </Button>
            </div>
          </CardContent>
          <ImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            projectId={projectId}
            onImportComplete={() => {
              toast.success("Programme imported");
              finishToProject();
            }}
          />
        </Card>
      )}
    </div>
  );
}
