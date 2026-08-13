"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { ProjectForm, type ProjectFormValues } from "@/components/projects/project-form";
import { toast } from "sonner";
import { BillingBanner } from "@/components/projects/billing-banner";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { getProjectStatusLabel } from "@/lib/project-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { labelFor } from "@/lib/format";

const MEMBER_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
};

function ClientLogoCard({
  projectId,
  clientName,
  hasLogo,
  cacheKey,
}: {
  projectId: string;
  clientName: string | null;
  hasLogo: boolean;
  cacheKey: string;
}) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.project.uploadClientLogo.useMutation({
    onSuccess: () => {
      utils.project.get.invalidate({ id: projectId });
      toast.success("Client logo uploaded");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.project.removeClientLogo.useMutation({
    onSuccess: () => {
      utils.project.get.invalidate({ id: projectId });
      toast.success("Client logo removed");
    },
    onError: (err) => toast.error(err.message),
  });

  function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== "string") return;
      uploadMutation.mutate({ projectId, imageBase64: result.split(",")[1] ?? "" });
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {clientName ? `${clientName}'s` : "The client's"} logo appears on the
          report cover under &ldquo;Prepared for&rdquo;.
        </p>
        <div className="flex items-center gap-4">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- small preview of user upload
            <img
              src={`/api/uploads/projects/${projectId}/branding/client-logo.png?v=${encodeURIComponent(cacheKey)}`}
              alt="Client logo"
              className="h-14 max-w-40 rounded border bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-14 w-28 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
              No logo yet
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={uploadMutation.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadMutation.isPending ? "Uploading..." : hasLogo ? "Replace" : "Upload logo"}
            </Button>
            {hasLogo && (
              <Button
                variant="ghost"
                size="sm"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate({ projectId })}
              >
                Remove
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2MB.</p>
      </CardContent>
    </Card>
  );
}

export default function ProjectSettingsPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: project, isLoading } = trpc.project.get.useQuery({
    id: params.projectId,
  });

  const { data: members = [] } = trpc.project.memberList.useQuery({
    projectId: params.projectId,
  });

  const { data: orgUsers = [] } = trpc.project.orgUsers.useQuery();
  const { data: currentUser } = trpc.project.currentUser.useQuery();

  const [addUserId, setAddUserId] = useState<string>("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("Project updated");
      utils.project.get.invalidate({ id: params.projectId });
      utils.project.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const archiveProject = trpc.project.archive.useMutation({
    onSuccess: () => {
      toast.success("Project archived");
      utils.project.list.invalidate();
      utils.project.get.invalidate({ id: params.projectId });
      router.push("/projects");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      utils.project.list.invalidate();
      router.push("/projects");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const restoreProject = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("Project restored");
      utils.project.get.invalidate({ id: params.projectId });
      utils.project.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const portalSession = trpc.project.createPortalSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.portalUrl;
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const addMember = trpc.project.memberAdd.useMutation({
    onSuccess: () => {
      toast.success("Member added");
      setAddUserId("");
      utils.project.memberList.invalidate({ projectId: params.projectId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeMember = trpc.project.memberRemove.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      setPendingRemoval(null);
      utils.project.memberList.invalidate({ projectId: params.projectId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (values: ProjectFormValues) => {
    updateProject.mutate({ id: params.projectId, ...values });
  };

  if (isLoading) {
    return <div className="h-96 animate-pulse rounded-lg border bg-muted" />;
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  const isArchived = project.status === "archived";

  // Org admins own every project (see assertProjectAccess) — surface them as
  // implicit "Owner" rows instead of pretending the project has no members.
  const owners = orgUsers.filter((u) => u.role === "admin");
  const ownerIds = new Set(owners.map((u) => u.id));
  const memberUserIds = new Set(members.map((m) => m.userId));
  // Exclude yourself and the owners from the picker — they already have access.
  const availableUsers = orgUsers.filter(
    (u) =>
      !memberUserIds.has(u.id) &&
      !ownerIds.has(u.id) &&
      u.id !== currentUser?.id
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ProjectBreadcrumb items={[{ label: "Settings" }]} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
        <p className="text-muted-foreground">
          Update project details for {project.name}.
        </p>
      </div>

      <BillingBanner status={project.status} />

      <ProjectForm
        defaultValues={{
          name: project.name,
          reference: project.reference ?? "",
          clientName: project.clientName ?? "",
          contractType: project.contractType ?? "",
          startDate: project.startDate ?? "",
          endDate: project.endDate ?? "",
          reportingFrequency: project.reportingFrequency ?? "monthly",
        }}
        onSubmit={handleSubmit}
        isSubmitting={updateProject.isPending}
        submitLabel="Update Project"
      />

      {/* Client branding */}
      <ClientLogoCard
        projectId={params.projectId}
        clientName={project.clientName}
        hasLogo={Boolean(project.clientLogoKey)}
        cacheKey={project.updatedAt ? String(project.updatedAt) : "0"}
      />

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {owners.map((owner) => (
              <div
                key={owner.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {owner.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">
                      {owner.name}
                      {owner.id === currentUser?.id && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {owner.email}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Owner
                </Badge>
              </div>
            ))}
            {members
              .filter((member) => !ownerIds.has(member.userId))
              .map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {member.user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">
                        {member.user.name}
                        {member.userId === currentUser?.id && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {member.user.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {labelFor(MEMBER_ROLE_LABELS, member.role)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setPendingRemoval({
                          userId: member.userId,
                          name: member.user.name,
                        })
                      }
                      disabled={removeMember.isPending}
                      aria-label={`Remove ${member.user.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
          {members.filter((m) => !ownerIds.has(m.userId)).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No other members yet. Add teammates to collaborate on this
              project.
            </p>
          )}

          {availableUsers.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Select value={addUserId} onValueChange={(val) => setAddUserId(val ?? "")}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a team member..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!addUserId || addMember.isPending}
                onClick={() =>
                  addMember.mutate({
                    projectId: params.projectId,
                    userId: addUserId,
                  })
                }
              >
                <UserPlus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.stripeSubscriptionId ? (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium">
                    {getProjectStatusLabel(project.status)}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => portalSession.mutate()}
                  disabled={portalSession.isPending}
                >
                  {portalSession.isPending ? "Loading..." : "Manage Billing"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Manage your subscription, update payment methods, or view
                invoices through the Stripe billing portal.
              </p>
            </>
          ) : project.status === "pending_payment" ? (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">Status: </span>
                <span className="font-medium">
                  {getProjectStatusLabel(project.status)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Checkout for this project hasn&apos;t been completed yet.
                Uploads, imports and report generation stay locked until
                payment is set up.
              </p>
            </>
          ) : (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">Plan: </span>
                <span className="font-medium">Free pilot</span>
              </div>
              <p className="text-xs text-muted-foreground">
                This project isn&apos;t on a paid subscription — all features
                are included and there is nothing to manage here.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className={isArchived ? undefined : "border-destructive/40"}>
        <CardHeader>
          <CardTitle className="text-base">
            {isArchived ? "Archived project" : "Danger Zone"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isArchived ? (
            <>
              <p className="text-sm text-muted-foreground">
                This project is archived. Restore it to move it back to your
                active list and resume uploads and reporting.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  restoreProject.mutate({
                    id: params.projectId,
                    status: "active",
                  })
                }
                disabled={restoreProject.isPending}
              >
                <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                {restoreProject.isPending ? "Restoring..." : "Restore project"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Archiving removes this project from your active list and
                cancels its subscription. Evidence and reports are retained.
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0"
                onClick={() => setArchiveOpen(true)}
                disabled={archiveProject.isPending}
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Archive project
              </Button>
            </>
          )}
        </CardContent>
        {/* Delete is available in both states — archived projects are the
            natural cleanup case, but a mistaken project shouldn't need
            archiving first. */}
        <CardContent className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Deleting removes this project permanently — its programme, all
            photos and evidence files, reports and audit history. This cannot
            be undone.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
            disabled={deleteProject.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete project
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{project.name}&rdquo; permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the programme, all photos and their files, every
              generated report and the audit history — for good. Any active
              subscription is cancelled. Type the project name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={project.name}
            aria-label="Type the project name to confirm deletion"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteProject.mutate({
                  id: params.projectId,
                  confirmName: deleteConfirm,
                })
              }
              disabled={
                deleteProject.isPending ||
                deleteConfirm.trim() !== project.name.trim()
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProject.isPending ? "Deleting..." : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive &ldquo;{project.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the project from your active list and cancel its
              subscription. Evidence, tasks and reports are kept and remain
              viewable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveProject.mutate({ id: params.projectId })}
              disabled={archiveProject.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiveProject.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval
                ? `${pendingRemoval.name} will lose access to this project. This doesn't delete their account.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRemoval) return;
                removeMember.mutate({
                  projectId: params.projectId,
                  userId: pendingRemoval.userId,
                });
              }}
              disabled={removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
